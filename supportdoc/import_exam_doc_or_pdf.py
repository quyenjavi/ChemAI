import os
import io
import re
import json
import uuid
import base64
import zipfile
import mimetypes
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from urllib.parse import quote

import fitz
import requests
from dotenv import load_dotenv
from openai import OpenAI
from PIL import Image, ImageDraw
from docx import Document
from lxml import etree

load_dotenv(".env")

# =========================================================
# FIXED CONFIG
# =========================================================
GRADE_IDS = {
    "10": "11111111-1111-1111-1111-111111111110",
    "11": "11111111-1111-1111-1111-111111111111",
    "12": "11111111-1111-1111-1111-111111111112",
}

UNIT_SCHEMA_PATH = "unit_schema.json"
MODEL = "gpt-4.1-mini"
PDF_SCALE = 2.0
BUCKET = "ChemAI"

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
OPENAI_KEY = os.getenv("OPENAI_API_KEY")

if not SUPABASE_URL or not SUPABASE_KEY or not OPENAI_KEY:
    raise RuntimeError(
        "Missing env vars. Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY"
    )

client = OpenAI(api_key=OPENAI_KEY)

# =========================================================
# PROMPTS
# =========================================================
SYSTEM_PROMPT_PDF = """
You are extracting Vietnamese chemistry exam questions from a PDF page image.

Critical rules:
1. DO NOT invent missing text, options, numbers, formulas, tables, answers, or diagrams.
2. Extract only what is clearly visible.
3. Ignore essay / tự luận questions completely.
4. For PDF import:
   - If a question contains any image, chart, figure, table, diagram, reaction scheme image, or embedded visual element, set "has_image_or_table": true.
   - Those questions will be skipped entirely by downstream code.
5. Keep multiple exams in the same file if they exist.
6. question_type must be exactly one of:
   - single_choice
   - true_false_group
   - short_answer
7. difficulty_academic must be exactly one of:
   - biet
   - hieu
   - van_dung
8. topic_unit must be chosen only from the allowed list.
9. true_false_group must use statements[] with keys a,b,c,d when present.
10. Return JSON array only.

JSON format:
[
  {
    "question_number": 1,
    "question_type": "single_choice|true_false_group|short_answer",
    "content": "...",
    "brief_content": "...",
    "options": [{"key":"A","text":"...","is_correct":true}],
    "statements": [{"key":"a","text":"...","correct_answer":true,"explanation":"...","tip":"..."}],
    "short_answers": [{"answer":"...","score":0.5,"explanation":"...","tip":"..."}],
    "explanation": "...",
    "brief_explanation": "...",
    "tip": "...",
    "topic_unit": "...",
    "difficulty_academic": "biet|hieu|van_dung",
    "exam_score": 0.25,
    "has_image_or_table": false
  }
]
"""

SYSTEM_PROMPT_DOCX = """
You are extracting Vietnamese chemistry exam questions from DOCX text blocks.

Critical rules:
1. DO NOT invent missing text, options, numbers, formulas, answers, or missing parts.
2. Keep multiple exams in the same file if they exist.
3. Ignore essay / tự luận questions completely.
4. For DOCX import:
   - If a question has an attached image/table marker, keep the question.
   - The downstream code will upload the image and store image_url.
5. question_type must be exactly one of:
   - single_choice
   - true_false_group
   - short_answer
6. difficulty_academic must be exactly one of:
   - biet
   - hieu
   - van_dung
7. topic_unit must be chosen only from the allowed list.
8. true_false_group must use statements[] with keys a,b,c,d when present.
9. Return JSON array only.

JSON format:
[
  {
    "question_number": 1,
    "question_type": "single_choice|true_false_group|short_answer",
    "content": "...",
    "brief_content": "...",
    "options": [{"key":"A","text":"...","is_correct":true}],
    "statements": [{"key":"a","text":"...","correct_answer":true,"explanation":"...","tip":"..."}],
    "short_answers": [{"answer":"...","score":0.5,"explanation":"...","tip":"..."}],
    "explanation": "...",
    "brief_explanation": "...",
    "tip": "...",
    "topic_unit": "...",
    "difficulty_academic": "biet|hieu|van_dung",
    "exam_score": 0.25,
    "has_image_or_table": false,
    "local_image_keys": ["img_1"]
  }
]
"""

# =========================================================
# HELPERS
# =========================================================
def slugify(text: str) -> str:
    text = text.strip().lower()
    text = re.sub(r"\s+", "_", text)
    text = re.sub(r"[^\w_]", "", text)
    return text or "untitled"


def extract_json_array(text: str) -> List[Dict[str, Any]]:
    try:
        start = text.find("[")
        end = text.rfind("]")
        if start == -1 or end == -1 or end < start:
            return []
        raw = text[start:end + 1]
        raw = re.sub(r'\\(?!["\\/bfnrtu])', r"\\\\", raw)
        data = json.loads(raw)
        return data if isinstance(data, list) else []
    except Exception as e:
        print("❌ JSON parse error:", e)
        return []


def api_headers(prefer_return: bool = False) -> Dict[str, str]:
    headers = {
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "apikey": SUPABASE_KEY,
        "Content-Type": "application/json",
    }
    if prefer_return:
        headers["Prefer"] = "return=representation"
    return headers


def upload_binary(storage_path: str, data: bytes, content_type: str) -> Optional[str]:
    safe_path = quote(storage_path)
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{safe_path}"

    headers = {
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "apikey": SUPABASE_KEY,
        "Content-Type": content_type,
        "x-upsert": "true"
    }

    r = requests.post(url, headers=headers, data=data, timeout=120)
    if r.status_code >= 400:
        print("❌ UPLOAD ERROR:", r.status_code, r.text)
        return None

    # bucket is public
    return f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{safe_path}"


def load_unit_schema_for_grade(grade_name: str) -> List[str]:
    with open(UNIT_SCHEMA_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    units = []
    for item in data:
        if str(item.get("grade_name")) == str(grade_name):
            for u in item.get("academic_units", []):
                if u not in units:
                    units.append(u)

    if not units:
        raise ValueError(f"No academic units found for grade {grade_name} in {UNIT_SCHEMA_PATH}")

    return units


def normalize_multiline_text(text: str) -> str:
    if not text:
        return text

    # xuống dòng cho mệnh đề a) b) c) d)
    text = re.sub(r"\s([a-d]\))", r"\n\1", text)

    # xuống dòng cho A. B. C. D.
    text = re.sub(r"\s([A-D]\.)", r"\n\1", text)

    # gọn khoảng trắng
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def safe_json_print(title: str, obj: Any) -> None:
    print(title)
    try:
        print(json.dumps(obj, ensure_ascii=False, indent=2))
    except Exception:
        print(str(obj))


# =========================================================
# DB
# =========================================================
def create_lesson(title: str, grade_id: str) -> str:
    url = f"{SUPABASE_URL}/rest/v1/lessons"
    payload = {
        "title": title,
        "grade_id": grade_id,
        "lesson_type": "practice",
        "is_visible": False,
        "question_count": 0
    }

    r = requests.post(url, headers=api_headers(prefer_return=True), json=payload, timeout=60)
    if r.status_code >= 400:
        raise RuntimeError(f"Create lesson failed: {r.status_code} - {r.text}")

    try:
        data = r.json()
    except Exception:
        raise RuntimeError(f"Create lesson response is not JSON: {r.text}")

    if isinstance(data, list) and data:
        return data[0]["id"]
    if isinstance(data, dict) and "id" in data:
        return data["id"]

    raise RuntimeError(f"Unexpected create_lesson response: {data}")


def insert_question(q: Dict[str, Any], lesson_id: str, image_url: Optional[str]) -> Optional[str]:
    url = f"{SUPABASE_URL}/rest/v1/questions"

    payload = {
        "lesson_id": lesson_id,
        "content": normalize_multiline_text(q.get("content", "")),
        "brief_content": q.get("brief_content"),
        "question_type": q.get("question_type"),
        "order_index": q.get("question_number"),
        "exam_score": q.get("exam_score", 0.25),
        "topic_unit": q.get("topic_unit"),
        "difficulty_academic": q.get("difficulty_academic"),
        "explanation": q.get("explanation"),
        "brief_explanation": q.get("brief_explanation"),
        "tip": q.get("tip"),
        "image_url": image_url
    }

    r = requests.post(url, headers=api_headers(prefer_return=True), json=payload, timeout=60)

    if r.status_code >= 400:
        print("❌ INSERT QUESTION ERROR:", r.status_code, r.text)
        safe_json_print("❌ QUESTION PAYLOAD:", payload)
        return None

    try:
        data = r.json()
    except Exception:
        print("❌ RESPONSE IS NOT JSON:", r.text)
        return None

    if isinstance(data, list):
        if not data:
            print("❌ INSERT QUESTION RETURNED EMPTY LIST")
            return None
        return data[0]["id"]

    if isinstance(data, dict) and "id" in data:
        return data["id"]

    print("❌ UNEXPECTED INSERT QUESTION RESPONSE:", data)
    return None


def insert_bulk(table: str, rows: List[Dict[str, Any]]) -> None:
    if not rows:
        return

    url = f"{SUPABASE_URL}/rest/v1/{table}"
    r = requests.post(url, headers=api_headers(prefer_return=False), json=rows, timeout=60)

    if r.status_code >= 400:
        print(f"❌ INSERT {table} ERROR:", r.status_code, r.text)
        safe_json_print(f"❌ {table} payload:", rows[:2])


def update_question_count(lesson_id: str) -> None:
    count_url = f"{SUPABASE_URL}/rest/v1/questions?lesson_id=eq.{lesson_id}&select=id"
    r = requests.get(count_url, headers=api_headers(), timeout=60)
    r.raise_for_status()
    cnt = len(r.json())

    patch_url = f"{SUPABASE_URL}/rest/v1/lessons?id=eq.{lesson_id}"
    r2 = requests.patch(
        patch_url,
        headers=api_headers(),
        json={"question_count": cnt},
        timeout=60
    )
    r2.raise_for_status()


# =========================================================
# PDF
# =========================================================
def render_pdf_page(page: fitz.Page) -> bytes:
    pix = page.get_pixmap(matrix=fitz.Matrix(PDF_SCALE, PDF_SCALE))
    return pix.tobytes("png")


def process_pdf(pdf_path: str, lesson_id: str, allowed_units: List[str]) -> int:
    doc = fitz.open(pdf_path)
    total = 0

    prompt = (
        SYSTEM_PROMPT_PDF
        + "\n\nAllowed topic_unit values:\n"
        + json.dumps(allowed_units, ensure_ascii=False, indent=2)
    )

    for i, page in enumerate(doc):
        print(f"\n📄 PDF page {i + 1}/{len(doc)}")
        page_bytes = render_pdf_page(page)
        img_b64 = base64.b64encode(page_bytes).decode()

        try:
            res = client.responses.create(
                model=MODEL,
                input=[
                    {
                        "role": "system",
                        "content": [{"type": "input_text", "text": prompt}]
                    },
                    {
                        "role": "user",
                        "content": [{"type": "input_image", "image_url": f"data:image/png;base64,{img_b64}"}]
                    }
                ]
            )
            items = extract_json_array(res.output_text)
        except Exception as e:
            print("❌ AI PDF ERROR:", e)
            continue

        if not items:
            print("⚠️ No questions extracted from this PDF page")
            continue

        for q in items:
            try:
                qtype = q.get("question_type")
                qnum = q.get("question_number")

                if qtype not in {"single_choice", "true_false_group", "short_answer"}:
                    print(f"⏭ Skip PDF Q{qnum}: invalid question_type = {qtype}")
                    continue

                if q.get("has_image_or_table"):
                    print(f"⏭ Skip PDF Q{qnum}: has image/table")
                    continue

                qid = insert_question(q, lesson_id, image_url=None)
                if not qid:
                    print(f"⏭ Skip PDF Q{qnum}: failed insert_question")
                    continue

                if qtype == "single_choice":
                    rows = []
                    for idx, o in enumerate(q.get("options", []), start=1):
                        rows.append({
                            "question_id": qid,
                            "option_key": o.get("key"),
                            "option_text": normalize_multiline_text(o.get("text", "")),
                            "is_correct": o.get("is_correct", False),
                            "sort_order": idx
                        })
                    insert_bulk("question_options", rows)

                elif qtype == "true_false_group":
                    rows = []
                    for idx, s in enumerate(q.get("statements", []), start=1):
                        rows.append({
                            "question_id": qid,
                            "statement_key": s.get("key"),
                            "statement_text": normalize_multiline_text(s.get("text", "")),
                            "correct_answer": s.get("correct_answer", False),
                            "sort_order": idx,
                            "score": 0.25,
                            "explanation": s.get("explanation"),
                            "tip": s.get("tip")
                        })
                    insert_bulk("question_statements", rows)

                elif qtype == "short_answer":
                    rows = []
                    for a in q.get("short_answers", []):
                        rows.append({
                            "question_id": qid,
                            "answer_text": a.get("answer"),
                            "score": a.get("score", 0.5),
                            "explanation": a.get("explanation"),
                            "tip": a.get("tip")
                        })
                    insert_bulk("question_short_answers", rows)

                print(f"✔ Inserted PDF Q{qnum}")
                total += 1

            except Exception as e:
                print(f"❌ PDF QUESTION ERROR Q{q.get('question_number')}: {e}")

    return total


# =========================================================
# DOCX
# =========================================================
def parse_docx_xml_blocks(docx_path: str) -> Tuple[List[Dict[str, Any]], Dict[str, Tuple[bytes, str]]]:
    """
    Returns:
      blocks in document order:
      [{"type":"text","text":"..."}, {"type":"image","key":"img_1"}, {"type":"table","key":"tbl_1"}]
      asset_map:
      {
        "img_1": (bytes, "image/png"),
        "tbl_1": (bytes, "image/png")
      }
    """
    blocks: List[Dict[str, Any]] = []
    asset_map: Dict[str, Tuple[bytes, str]] = {}

    with zipfile.ZipFile(docx_path, "r") as z:
        document_xml = z.read("word/document.xml")
        rels_xml = z.read("word/_rels/document.xml.rels")

        rels_root = etree.fromstring(rels_xml)
        ns_rel = {"pr": "http://schemas.openxmlformats.org/package/2006/relationships"}
        rel_map = {}
        for rel in rels_root.findall("pr:Relationship", namespaces=ns_rel):
            rel_map[rel.get("Id")] = rel.get("Target")

        root = etree.fromstring(document_xml)
        ns = {
            "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
            "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
            "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
        }
        body = root.find("w:body", namespaces=ns)

        img_counter = 1
        tbl_counter = 1

        for child in body:
            tag = etree.QName(child).localname

            if tag == "p":
                texts = child.xpath(".//w:t/text()", namespaces=ns)
                paragraph_text = "".join(texts).strip()
                if paragraph_text:
                    blocks.append({"type": "text", "text": paragraph_text})

                drawings = child.xpath(".//a:blip", namespaces=ns)
                for blip in drawings:
                    rid = blip.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed")
                    if not rid or rid not in rel_map:
                        continue

                    target = rel_map[rid].replace("\\", "/")
                    file_path = f"word/{target}" if not target.startswith("word/") else target
                    if file_path not in z.namelist():
                        continue

                    key = f"img_{img_counter}"
                    raw = z.read(file_path)
                    mime = mimetypes.guess_type(file_path)[0] or "image/png"
                    asset_map[key] = (raw, mime)
                    blocks.append({"type": "image", "key": key})
                    img_counter += 1

            elif tag == "tbl":
                rows = []
                for tr in child.xpath(".//w:tr", namespaces=ns):
                    cells = []
                    for tc in tr.xpath("./w:tc", namespaces=ns):
                        cell_text = "".join(tc.xpath(".//w:t/text()", namespaces=ns)).strip()
                        cells.append(cell_text)
                    if any(cells):
                        rows.append(cells)

                # giữ bảng thành ảnh, không ép thành text một dòng xấu
                if rows:
                    img_bytes = table_rows_to_png(rows)
                    key = f"tbl_{tbl_counter}"
                    asset_map[key] = (img_bytes, "image/png")
                    blocks.append({"type": "table", "key": key})
                    tbl_counter += 1

    return blocks, asset_map


def table_rows_to_png(rows: List[List[str]]) -> bytes:
    """
    Render table to a simple PNG so downstream can upload and store image_url.
    """
    # normalize rows
    max_cols = max(len(r) for r in rows)
    norm_rows = [r + [""] * (max_cols - len(r)) for r in rows]

    col_width = 260
    row_height = 50
    pad = 20
    width = max_cols * col_width + pad * 2
    height = len(norm_rows) * row_height + pad * 2

    img = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(img)

    # draw grid and text
    for i, row in enumerate(norm_rows):
        for j, cell in enumerate(row):
            x1 = pad + j * col_width
            y1 = pad + i * row_height
            x2 = x1 + col_width
            y2 = y1 + row_height

            draw.rectangle([x1, y1, x2, y2], outline="black", width=1)
            draw.text((x1 + 8, y1 + 8), cell[:120], fill="black")

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def chunk_docx_by_question(blocks: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
    """
    Group blocks by detecting 'Câu X' in text blocks.
    This reduces skip when a doc has multiple exams or long content.
    """
    chunks = []
    current = []

    def starts_question(text: str) -> bool:
        return re.match(r"^\s*Câu\s*\d+[\.:]?", text, flags=re.IGNORECASE) is not None

    for block in blocks:
        if block["type"] == "text" and starts_question(block["text"]):
            if current:
                chunks.append(current)
            current = [block]
        else:
            if not current:
                current = [block]
            else:
                current.append(block)

    if current:
        chunks.append(current)

    return chunks


def render_docx_chunk_for_ai(chunk: List[Dict[str, Any]]) -> Tuple[str, List[str]]:
    """
    Returns:
      text payload
      local image/table keys attached to this chunk
    """
    lines = []
    local_asset_keys = []

    for block in chunk:
        if block["type"] == "text":
            text = normalize_multiline_text(block["text"])
            lines.append(text)
        elif block["type"] == "image":
            lines.append(f"[INLINE_IMAGE:{block['key']}]")
            local_asset_keys.append(block["key"])
        elif block["type"] == "table":
            lines.append(f"[TABLE_IMAGE:{block['key']}]")
            local_asset_keys.append(block["key"])

    return "\n".join(lines).strip(), local_asset_keys


def process_docx(docx_path: str, lesson_id: str, allowed_units: List[str]) -> int:
    blocks, asset_map = parse_docx_xml_blocks(docx_path)
    chunks = chunk_docx_by_question(blocks)
    total = 0

    print(f"📚 DOCX blocks: {len(blocks)}")
    print(f"📚 DOCX chunks by question: {len(chunks)}")

    uploaded_urls: Dict[str, str] = {}

    for idx, chunk in enumerate(chunks, start=1):
        text_payload, local_asset_keys = render_docx_chunk_for_ai(chunk)
        if not text_payload:
            continue

        prompt = (
            SYSTEM_PROMPT_DOCX
            + "\n\nAllowed topic_unit values:\n"
            + json.dumps(allowed_units, ensure_ascii=False, indent=2)
            + "\n\nDOCX content below:\n"
            + text_payload
        )

        content = [{"type": "input_text", "text": prompt}]

        # attach images/tables in current chunk to AI
        for key in local_asset_keys:
            raw, _mime = asset_map[key]
            b64 = base64.b64encode(raw).decode()
            content.append({"type": "input_image", "image_url": f"data:image/png;base64,{b64}"})

        print(f"\n📄 DOCX chunk {idx}/{len(chunks)}")

        try:
            res = client.responses.create(
                model=MODEL,
                input=[{"role": "user", "content": content}]
            )
            items = extract_json_array(res.output_text)
        except Exception as e:
            print("❌ AI DOCX ERROR:", e)
            continue

        if not items:
            print("⚠️ No questions extracted from this DOCX chunk")
            continue

        for q in items:
            try:
                qtype = q.get("question_type")
                qnum = q.get("question_number")

                if qtype not in {"single_choice", "true_false_group", "short_answer"}:
                    print(f"⏭ Skip DOCX Q{qnum}: invalid question_type = {qtype}")
                    continue

                image_url = None
                q_local_image_keys = q.get("local_image_keys", []) or []

                # DOCX: if question has image or table, upload first related asset
                if q.get("has_image_or_table") and q_local_image_keys:
                    asset_key = q_local_image_keys[0]
                    if asset_key in uploaded_urls:
                        image_url = uploaded_urls[asset_key]
                    elif asset_key in asset_map:
                        raw, mime = asset_map[asset_key]
                        ext = ".png"
                        if mime == "image/jpeg":
                            ext = ".jpg"
                        storage_path = f"questions/{slugify(Path(docx_path).stem)}/{uuid.uuid4().hex}{ext}"
                        public_url = upload_binary(storage_path, raw, mime)
                        if public_url:
                            uploaded_urls[asset_key] = public_url
                            image_url = public_url

                qid = insert_question(q, lesson_id, image_url=image_url)
                if not qid:
                    print(f"⏭ Skip DOCX Q{qnum}: failed insert_question")
                    continue

                if qtype == "single_choice":
                    rows = []
                    for i_opt, o in enumerate(q.get("options", []), start=1):
                        rows.append({
                            "question_id": qid,
                            "option_key": o.get("key"),
                            "option_text": normalize_multiline_text(o.get("text", "")),
                            "is_correct": o.get("is_correct", False),
                            "sort_order": i_opt
                        })
                    insert_bulk("question_options", rows)

                elif qtype == "true_false_group":
                    rows = []
                    for i_stmt, s in enumerate(q.get("statements", []), start=1):
                        rows.append({
                            "question_id": qid,
                            "statement_key": s.get("key"),
                            "statement_text": normalize_multiline_text(s.get("text", "")),
                            "correct_answer": s.get("correct_answer", False),
                            "sort_order": i_stmt,
                            "score": 0.25,
                            "explanation": s.get("explanation"),
                            "tip": s.get("tip")
                        })
                    insert_bulk("question_statements", rows)

                elif qtype == "short_answer":
                    rows = []
                    for ans in q.get("short_answers", []):
                        rows.append({
                            "question_id": qid,
                            "answer_text": ans.get("answer"),
                            "score": ans.get("score", 0.5),
                            "explanation": ans.get("explanation"),
                            "tip": ans.get("tip")
                        })
                    insert_bulk("question_short_answers", rows)

                print(f"✔ Inserted DOCX Q{qnum}")
                total += 1

            except Exception as e:
                print(f"❌ DOCX QUESTION ERROR Q{q.get('question_number')}: {e}")

    return total


# =========================================================
# MAIN
# =========================================================
def main():
    file_path = input("📄 File (.pdf/.docx): ").strip()
    lesson_title = input("📘 Lesson title: ").strip()
    grade_name = input("🎓 Grade name (10/11/12): ").strip()

    if grade_name not in GRADE_IDS:
        raise ValueError("Grade name must be one of: 10, 11, 12")

    grade_id = GRADE_IDS[grade_name]
    allowed_units = load_unit_schema_for_grade(grade_name)

    ext = Path(file_path).suffix.lower()
    if ext not in {".pdf", ".docx"}:
        raise ValueError("Only .pdf and .docx are supported")

    lesson_id = create_lesson(lesson_title, grade_id)
    print("✅ Lesson created:", lesson_id)

    inserted = 0
    if ext == ".pdf":
        inserted = process_pdf(file_path, lesson_id, allowed_units)
    else:
        inserted = process_docx(file_path, lesson_id, allowed_units)

    update_question_count(lesson_id)
    print(f"\n🎉 DONE. Inserted {inserted} questions. Lesson ID = {lesson_id}")


if __name__ == "__main__":
    main()