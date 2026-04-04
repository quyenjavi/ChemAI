import os
import io
import re
import json
import time
import base64
import zipfile
import unicodedata
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple

import fitz
from dotenv import load_dotenv
from openai import OpenAI
from PIL import Image, ImageDraw
from lxml import etree

load_dotenv(".env")

# =========================================================
# INPUT
# =========================================================
FILE_PATH = input("📄 File (.pdf/.docx): ").strip()
LESSON_TITLE = input("📘 Lesson title: ").strip()
GRADE_NAME = input("🎓 Grade name (10/11/12): ").strip()

# =========================================================
# FIXED CONFIG
# =========================================================
GRADE_IDS = {
    "10": "11111111-1111-1111-1111-111111111110",
    "11": "11111111-1111-1111-1111-111111111111",
    "12": "11111111-1111-1111-1111-111111111112",
}
UNIT_SCHEMA_JSON = "unit_schema.json"
MODEL = "gpt-4.1-mini"
PDF_SCALE = 2.0

OPENAI_KEY = os.getenv("OPENAI_API_KEY")
if not OPENAI_KEY:
    raise RuntimeError("Missing OPENAI_API_KEY in .env")

if GRADE_NAME not in GRADE_IDS:
    raise ValueError("Grade name must be one of: 10, 11, 12")

client = OpenAI(api_key=OPENAI_KEY)

# =========================================================
# PROMPTS
# =========================================================
PROMPT_GENERAL = """
You are extracting Vietnamese chemistry exam questions.

Strict rules:
1. DO NOT invent content.
2. Extract ONLY what is present in the input.
3. Ignore essay / tự luận.
4. question_type must be exactly one of:
   - single_choice
   - true_false_group
   - short_answer
5. difficulty_academic must be exactly one of:
   - biet
   - hieu
   - van_dung
6. For true_false_group:
   - content must contain ONLY the shared stem, not the a/b/c/d statements
   - statements[] must contain the individual a/b/c/d items
7. For short_answer:
   - keep the exact question wording
   - include answer if clearly present
8. topic_unit must be chosen only from the allowed list.
9. Return JSON array only.

Required JSON format:
[
  {
    "question_number": 1,
    "question_type": "single_choice|true_false_group|short_answer",
    "content": "full stem only",
    "brief_content": "short summary",
    "options": [
      {"key":"A","text":"...", "is_correct": true}
    ],
    "statements": [
      {"key":"a","text":"...", "correct_answer": true, "explanation":"...", "tip":"..."}
    ],
    "short_answers": [
      {"answer":"...", "score":0.5, "explanation":"...", "tip":"..."}
    ],
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

PROMPT_SHORT_ANSWER_RETRY = """
You are extracting ONLY short-answer chemistry exam questions from the input.

Strict rules:
1. Extract only short-answer / trả lời ngắn questions.
2. Ignore single-choice and true/false questions.
3. DO NOT invent missing content.
4. Keep the exact question wording.
5. Return JSON array only.

Format:
[
  {
    "question_number": 1,
    "question_type": "short_answer",
    "content": "...",
    "brief_content": "...",
    "short_answers": [
      {"answer":"...", "score":0.5, "explanation":"...", "tip":"..."}
    ],
    "explanation": "...",
    "brief_explanation": "...",
    "tip": "...",
    "topic_unit": "...",
    "difficulty_academic": "biet|hieu|van_dung",
    "exam_score": 0.5,
    "has_image_or_table": false,
    "local_image_keys": []
  }
]
"""

# =========================================================
# HELPERS
# =========================================================
def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode("ascii")
    text = text.lower()
    text = re.sub(r"\s+", "_", text)
    text = re.sub(r"[^\w_]", "", text)
    return text.strip("_") or "untitled"


def load_unit_schema(path: str, grade_name: str) -> List[str]:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    units = []
    for item in data:
        if str(item.get("grade_name")) == str(grade_name):
            for u in item.get("academic_units", []):
                if u not in units:
                    units.append(u)

    if not units:
        raise ValueError(f"No academic_units found for grade {grade_name} in {path}")
    return units


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


def normalize_text_for_display(text: Optional[str]) -> Optional[str]:
    if not text:
        return text
    text = re.sub(r"\s([a-d]\))", r"\n\1", text)
    text = re.sub(r"\s([A-D]\.)", r"\n\1", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def clean_true_false_content(content: Optional[str], statements: List[Dict[str, Any]]) -> Optional[str]:
    if not content:
        return content
    cleaned = content
    for s in statements:
        st = s.get("text", "")
        if st:
            cleaned = cleaned.replace(st, "")
    cleaned = re.sub(r"\n{2,}", "\n", cleaned).strip()
    cleaned = re.split(r"\n?a\)", cleaned)[0].strip()
    return cleaned


def looks_like_short_answer_chunk(text: str) -> bool:
    text_low = text.lower()
    return any(m in text_low for m in ["trắc nghiệm trả lời ngắn", "phần iii", "trả lời ngắn"])


def save_json(path: str, data: Any) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def call_openai_extract(prompt: str, content_blocks: List[Dict[str, Any]], retries: int = 3) -> List[Dict[str, Any]]:
    last_err = None
    for i in range(retries):
        try:
            res = client.responses.create(
                model=MODEL,
                input=[{"role": "user", "content": content_blocks}]
            )
            return extract_json_array(res.output_text)
        except Exception as e:
            last_err = e
            print(f"⚠️ OpenAI retry {i+1}/{retries}: {e}")
            time.sleep(1.5 * (i + 1))
    print("❌ AI FAILED:", last_err)
    return []

# =========================================================
# PDF
# =========================================================
def render_page_to_png_bytes(page: fitz.Page) -> bytes:
    pix = page.get_pixmap(matrix=fitz.Matrix(PDF_SCALE, PDF_SCALE))
    return pix.tobytes("png")


def process_pdf(pdf_path: str, allowed_units: List[str]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], Dict[str, str]]:
    doc = fitz.open(pdf_path)
    questions = []
    failed_chunks = []
    asset_manifest = {}

    for i, page in enumerate(doc):
        print(f"\n📄 PDF page {i + 1}")
        img_bytes = render_page_to_png_bytes(page)
        key = f"pdf_page_{i+1}"
        asset_path = f"extracted_assets/{slugify(Path(pdf_path).stem)}/{key}.png"
        Path(asset_path).parent.mkdir(parents=True, exist_ok=True)
        Path(asset_path).write_bytes(img_bytes)
        asset_manifest[key] = asset_path

        img_b64 = base64.b64encode(img_bytes).decode()
        prompt = (
            PROMPT_GENERAL
            + "\nAllowed topic_unit values:\n"
            + json.dumps(allowed_units, ensure_ascii=False, indent=2)
            + "\nFor PDF: if question has image/table => has_image_or_table = true."
        )

        items = call_openai_extract(
            prompt,
            [
                {"type": "input_text", "text": prompt},
                {"type": "input_image", "image_url": f"data:image/png;base64,{img_b64}"}
            ]
        )

        if not items:
            failed_chunks.append({
                "source": "pdf",
                "page": i + 1,
                "reason": "no_questions_extracted"
            })
            continue

        for q in items:
            qnum = q.get("question_number")
            qtype = q.get("question_type")

            if q.get("has_image_or_table"):
                failed_chunks.append({
                    "source": "pdf",
                    "page": i + 1,
                    "question_number": qnum,
                    "reason": "has_image_or_table"
                })
                continue

            if qtype not in {"single_choice", "true_false_group", "short_answer"}:
                failed_chunks.append({
                    "source": "pdf",
                    "page": i + 1,
                    "question_number": qnum,
                    "reason": "invalid_question_type"
                })
                continue

            if qtype == "true_false_group":
                q["content"] = clean_true_false_content(q.get("content"), q.get("statements", []))

            q["content"] = normalize_text_for_display(q.get("content"))
            q["source"] = "pdf"
            q["source_page"] = i + 1
            questions.append(q)

    return questions, failed_chunks, asset_manifest


# =========================================================
# DOCX
# =========================================================
REL_NS = {"pr": "http://schemas.openxmlformats.org/package/2006/relationships"}
W_NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
A_NS = {"a": "http://schemas.openxmlformats.org/drawingml/2006/main"}
R_NS = {"r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}


def table_rows_to_png(rows: List[List[str]]) -> bytes:
    max_cols = max(len(r) for r in rows)
    rows = [r + [""] * (max_cols - len(r)) for r in rows]

    col_width = 260
    row_height = 48
    pad = 20
    width = max_cols * col_width + pad * 2
    height = len(rows) * row_height + pad * 2

    img = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(img)

    for i, row in enumerate(rows):
        for j, cell in enumerate(row):
            x1 = pad + j * col_width
            y1 = pad + i * row_height
            x2 = x1 + col_width
            y2 = y1 + row_height
            draw.rectangle([x1, y1, x2, y2], outline="black", width=1)
            draw.text((x1 + 6, y1 + 6), cell[:120], fill="black")

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def parse_docx_blocks(docx_path: str) -> Tuple[List[Dict[str, Any]], Dict[str, str]]:
    asset_manifest: Dict[str, str] = {}
    blocks: List[Dict[str, Any]] = []
    base_dir = Path("extracted_assets") / slugify(Path(docx_path).stem)
    base_dir.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(docx_path, "r") as z:
        document_xml = z.read("word/document.xml")
        rels_xml = z.read("word/_rels/document.xml.rels")

        rels_root = etree.fromstring(rels_xml)
        rel_map = {}
        for rel in rels_root.findall("pr:Relationship", namespaces=REL_NS):
            rel_id = rel.get("Id")
            target = rel.get("Target")
            rel_map[rel_id] = target

        root = etree.fromstring(document_xml)
        body = root.find("w:body", namespaces=W_NS)

        img_counter = 1
        tbl_counter = 1

        for child in body:
            tag = etree.QName(child).localname

            if tag == "p":
                texts = child.xpath(".//w:t/text()", namespaces=W_NS)
                paragraph_text = "".join(texts).strip()
                if paragraph_text:
                    blocks.append({"type": "text", "text": normalize_text_for_display(paragraph_text)})

                drawings = child.xpath(".//a:blip", namespaces={**A_NS, **R_NS})
                for blip in drawings:
                    rid = blip.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed")
                    if not rid or rid not in rel_map:
                        continue
                    target = rel_map[rid].replace("\\", "/")
                    file_path = f"word/{target}" if not target.startswith("word/") else target
                    if file_path in z.namelist():
                        key = f"img_{img_counter}"
                        raw = z.read(file_path)
                        out_path = base_dir / f"{key}.png"
                        out_path.write_bytes(raw)
                        asset_manifest[key] = str(out_path)
                        blocks.append({"type": "image", "key": key})
                        img_counter += 1

            elif tag == "tbl":
                rows = []
                for tr in child.xpath(".//w:tr", namespaces=W_NS):
                    cells = []
                    for tc in tr.xpath("./w:tc", namespaces=W_NS):
                        cell_text = "".join(tc.xpath(".//w:t/text()", namespaces=W_NS)).strip()
                        cells.append(cell_text)
                    if any(cells):
                        rows.append(cells)

                if rows:
                    key = f"tbl_{tbl_counter}"
                    out_path = base_dir / f"{key}.png"
                    out_path.write_bytes(table_rows_to_png(rows))
                    asset_manifest[key] = str(out_path)
                    blocks.append({"type": "table", "key": key})
                    tbl_counter += 1

    return blocks, asset_manifest


def starts_question(text: str) -> bool:
    return re.match(r"^\s*Câu\s*\d+[\.:]?", text, flags=re.IGNORECASE) is not None


def chunk_docx_blocks(blocks: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
    chunks = []
    current = []

    for b in blocks:
        if b["type"] == "text" and starts_question(b["text"]):
            if current:
                chunks.append(current)
            current = [b]
        else:
            if not current:
                current = [b]
            else:
                current.append(b)

    if current:
        chunks.append(current)

    return chunks


def render_docx_chunk_for_ai(chunk: List[Dict[str, Any]]) -> Tuple[str, List[str]]:
    lines = []
    asset_keys = []

    for b in chunk:
        if b["type"] == "text":
            lines.append(b["text"])
        elif b["type"] == "image":
            lines.append(f"[INLINE_IMAGE:{b['key']}]")
            asset_keys.append(b["key"])
        elif b["type"] == "table":
            lines.append(f"[TABLE_IMAGE:{b['key']}]")
            asset_keys.append(b["key"])

    return "\n".join(lines).strip(), asset_keys


def process_docx(docx_path: str, allowed_units: List[str]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], Dict[str, str]]:
    blocks, asset_manifest = parse_docx_blocks(docx_path)
    chunks = chunk_docx_blocks(blocks)

    questions = []
    failed_chunks: List[Dict[str, Any]] = []

    print(f"📚 DOCX chunks: {len(chunks)}")

    # pass 1
    for ci, chunk in enumerate(chunks, start=1):
        print(f"\n📄 DOCX chunk {ci}/{len(chunks)}")
        text_payload, asset_keys = render_docx_chunk_for_ai(chunk)

        prompt = (
            PROMPT_GENERAL
            + "\nAllowed topic_unit values:\n"
            + json.dumps(allowed_units, ensure_ascii=False, indent=2)
            + "\n\nDOCX content:\n"
            + text_payload
        )

        content_blocks = [{"type": "input_text", "text": prompt}]
        for key in asset_keys:
            raw = Path(asset_manifest[key]).read_bytes()
            img_b64 = base64.b64encode(raw).decode()
            content_blocks.append({"type": "input_image", "image_url": f"data:image/png;base64,{img_b64}"})

        items = call_openai_extract(prompt, content_blocks)

        if not items:
            print("⚠️ No questions extracted from this DOCX chunk")
            failed_chunks.append({
                "source": "docx",
                "chunk_index": ci,
                "reason": "no_questions_extracted",
                "text_payload": text_payload,
                "asset_keys": asset_keys
            })
            continue

        inserted_any = False
        for q in items:
            qtype = q.get("question_type")
            qnum = q.get("question_number")

            if qtype not in {"single_choice", "true_false_group", "short_answer"}:
                failed_chunks.append({
                    "source": "docx",
                    "chunk_index": ci,
                    "question_number": qnum,
                    "reason": "invalid_question_type",
                    "text_payload": text_payload,
                    "asset_keys": asset_keys
                })
                continue

            if qtype == "true_false_group":
                q["content"] = clean_true_false_content(q.get("content"), q.get("statements", []))

            q["content"] = normalize_text_for_display(q.get("content"))
            q["source"] = "docx"
            q["chunk_index"] = ci
            q["asset_keys_in_chunk"] = asset_keys

            questions.append(q)
            inserted_any = True
            print(f"✔ Extracted DOCX Q{qnum}")

        if not inserted_any and looks_like_short_answer_chunk(text_payload):
            failed_chunks.append({
                "source": "docx",
                "chunk_index": ci,
                "reason": "short_answer_retry_candidate",
                "text_payload": text_payload,
                "asset_keys": asset_keys
            })

    # pass 2 retry for short answer / no extract
    retry_targets = []
    seen = set()
    for item in failed_chunks:
        if item["source"] == "docx" and item["reason"] in {"no_questions_extracted", "short_answer_retry_candidate"}:
            k = item["chunk_index"]
            if k not in seen:
                seen.add(k)
                retry_targets.append(item)

    if retry_targets:
        print(f"\n🔁 Retry pass for {len(retry_targets)} DOCX chunks")

    for item in retry_targets:
        ci = item["chunk_index"]
        text_payload = item["text_payload"]
        asset_keys = item.get("asset_keys", [])

        prompt = (
            PROMPT_SHORT_ANSWER_RETRY
            + "\nAllowed topic_unit values:\n"
            + json.dumps(allowed_units, ensure_ascii=False, indent=2)
            + "\n\nDOCX content:\n"
            + text_payload
        )

        content_blocks = [{"type": "input_text", "text": prompt}]
        for key in asset_keys:
            raw = Path(asset_manifest[key]).read_bytes()
            img_b64 = base64.b64encode(raw).decode()
            content_blocks.append({"type": "input_image", "image_url": f"data:image/png;base64,{img_b64}"})

        items = call_openai_extract(prompt, content_blocks)
        if not items:
            continue

        for q in items:
            qtype = q.get("question_type")
            if qtype != "short_answer":
                continue

            q["content"] = normalize_text_for_display(q.get("content"))
            q["source"] = "docx_retry"
            q["chunk_index"] = ci
            q["asset_keys_in_chunk"] = asset_keys
            questions.append(q)
            print(f"✔ Retry extracted short answer Q{q.get('question_number')}")

    return questions, failed_chunks, asset_manifest


# =========================================================
# MAIN
# =========================================================
def main():
    ext = Path(FILE_PATH).suffix.lower()
    if ext not in {".pdf", ".docx"}:
        raise ValueError("Only .pdf and .docx are supported")

    allowed_units = load_unit_schema(UNIT_SCHEMA_JSON, grade_name=GRADE_NAME)

    if ext == ".pdf":
        questions, failed_chunks, asset_manifest = process_pdf(FILE_PATH, allowed_units)
    else:
        questions, failed_chunks, asset_manifest = process_docx(FILE_PATH, allowed_units)

    out_dir = Path("extract_output") / slugify(LESSON_TITLE)
    out_dir.mkdir(parents=True, exist_ok=True)

    extract_result = {
        "lesson_title": LESSON_TITLE,
        "grade_name": GRADE_NAME,
        "grade_id": GRADE_IDS[GRADE_NAME],
        "source_file": FILE_PATH,
        "question_count": len(questions),
        "questions": questions
    }

    save_json(out_dir / "extract_result.json", extract_result)
    save_json(out_dir / "failed_chunks.json", failed_chunks)
    save_json(out_dir / "assets_manifest.json", asset_manifest)

    print(f"\n🎉 DONE EXTRACT")
    print(f"Questions: {len(questions)}")
    print(f"Failed chunks: {len(failed_chunks)}")
    print(f"Output dir: {out_dir}")


if __name__ == "__main__":
    main()
