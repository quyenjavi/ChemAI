import os
import json
import base64
import re
import ast
import argparse
from pathlib import Path

import fitz  # PyMuPDF
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv(".env")

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

MODEL = "gpt-4.1-mini"
OUT_DIR = "parsed_textbook_blocks"
DEBUG_DIR = "parsed_textbook_debug"

PROMPT = """
Bạn đang đọc sách giáo khoa Hóa học THPT để đưa vào database phục vụ:
- tạo bài học
- tạo tóm tắt bài
- hỗ trợ ra đề sau này

Hãy đọc nội dung các trang của MỘT bài học và trích xuất thành JSON array các block text.

Yêu cầu:
1. Chỉ lấy nội dung chữ chính, ưu tiên text.
2. Bỏ qua watermark, số trang, họa tiết trang trí.
3. Nếu có hình ảnh/phương trình/bảng nhưng chưa đọc hết được, vẫn tóm tắt text liên quan.
4. Chia block theo các loại:
- objective
- intro
- theory
- example
- experiment
- activity
- exercise
- summary
- application
- fact
- note
- formula
- glossary
- other

5. Mỗi block trả về:
- block_type
- title
- content
- page_number
- has_figure
- has_table
- has_formula

6. Chỉ trả về JSON array hợp lệ, không giải thích thêm.
7. Không được dùng markdown code fence.
8. Không được dùng LaTeX escape như \\( \\) \\[ \\].
9. Không được chèn backslash không cần thiết.
10. Mọi chuỗi phải là JSON hợp lệ tuyệt đối.
11. Nếu có công thức hóa học, hãy viết dưới dạng text thường, ví dụ: H2SO4, CO2, Fe3+.
12. Nếu không chắc block_type, dùng other.
13. Không bỏ sót phần "Em đã học", "Em có thể", "Em có biết", "Câu hỏi và bài tập", "Hoạt động", "Mục tiêu" nếu có.
"""

def ensure_dirs():
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(DEBUG_DIR, exist_ok=True)

def image_to_base64(pix):
    return base64.b64encode(pix.tobytes("png")).decode("utf-8")

def render_pages(pdf_path, start_page, end_page, zoom=2.0):
    doc = fitz.open(pdf_path)
    pages = []
    try:
        total_pages = len(doc)
        if start_page < 1 or end_page > total_pages:
            raise ValueError(
                f"Invalid page range {start_page}-{end_page} for {pdf_path}, total pages={total_pages}"
            )

        for page_num in range(start_page - 1, end_page):
            page = doc.load_page(page_num)
            mat = fitz.Matrix(zoom, zoom)
            pix = page.get_pixmap(matrix=mat, alpha=False)
            pages.append({
                "page_number": page_num + 1,
                "image_base64": image_to_base64(pix)
            })
    finally:
        doc.close()

    return pages

def extract_json_array(text):
    text = text.strip()

    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)

    start = text.find("[")
    end = text.rfind("]")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("OpenAI response is not a valid JSON array wrapper")

    return text[start:end + 1]

def clean_invalid_escapes(raw):
    return re.sub(r'\\(?!["\\/bfnrtu])', r"\\\\", raw)

def safe_parse_json_array(text, debug_name="debug_invalid_json_response.txt"):
    raw = extract_json_array(text)

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    cleaned = clean_invalid_escapes(raw)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    try:
        return ast.literal_eval(cleaned)
    except Exception as e:
        debug_path = os.path.join(DEBUG_DIR, debug_name)
        with open(debug_path, "w", encoding="utf-8") as f:
            f.write(text)
        raise ValueError(
            f"Failed to parse model JSON. Debug saved to {debug_path}. Root error: {e}"
        )

def ask_openai_for_blocks(lesson_title, pages):
    input_content = [
        {
            "type": "input_text",
            "text": f"Bài học: {lesson_title}\nHãy trích xuất block nội dung."
        }
    ]

    for p in pages:
        input_content.append({
            "type": "input_text",
            "text": f"Trang {p['page_number']}"
        })
        input_content.append({
            "type": "input_image",
            "image_url": f"data:image/png;base64,{p['image_base64']}"
        })

    response = client.responses.create(
        model=MODEL,
        input=[
            {
                "role": "system",
                "content": [{"type": "input_text", "text": PROMPT}]
            },
            {
                "role": "user",
                "content": input_content
            }
        ]
    )

    text = (response.output_text or "").strip()
    debug_name = f"{slugify(lesson_title)}_raw_response.txt"
    raw_path = os.path.join(DEBUG_DIR, debug_name)
    with open(raw_path, "w", encoding="utf-8") as f:
        f.write(text)

    return safe_parse_json_array(
        text,
        debug_name=f"{slugify(lesson_title)}_invalid_json.txt"
    )

def ask_openai_for_blocks_with_retry(lesson_title, pages, max_attempts=2):
    last_err = None
    for attempt in range(1, max_attempts + 1):
        try:
            return ask_openai_for_blocks(lesson_title, pages)
        except Exception as e:
            last_err = e
            print(f"Retry {attempt}/{max_attempts} for lesson={lesson_title} because: {e}")
    raise last_err

def slugify(text):
    text = str(text).strip().lower()
    text = re.sub(r"[\\/:\*\?\"<>\|]", "_", text)
    text = re.sub(r"\s+", "_", text)
    return text

def normalize_text(text):
    return str(text or "").strip().lower()

def should_process_lesson(lesson_title, selected_lessons):
    if not selected_lessons:
        return True
    lt = normalize_text(lesson_title)
    targets = [normalize_text(x) for x in selected_lessons]
    return lt in targets

def load_manifest(manifest_path):
    with open(manifest_path, "r", encoding="utf-8") as f:
        return json.load(f)

def build_output_path(book, lesson_title):
    safe_name = f"{book['grade_name']}_{lesson_title}"
    safe_name = slugify(safe_name)
    return os.path.join(OUT_DIR, safe_name + ".json")

def process_manifest(manifest, selected_lessons=None, overwrite=False):
    ensure_dirs()

    total = 0
    success = 0
    skipped = 0
    failed = 0

    for book in manifest:
        pdf_path = book["source_pdf_filename"]

        if not os.path.exists(pdf_path):
            print(f"SKIP missing file: {pdf_path}")
            continue

        for chapter in book.get("chapters", []):
            for lesson in chapter.get("lessons", []):
                lesson_title = lesson["title"]

                if not should_process_lesson(lesson_title, selected_lessons):
                    continue

                total += 1
                start_page = lesson["start_page"]
                end_page = lesson["end_page"]

                out_path = build_output_path(book, lesson_title)

                if os.path.exists(out_path) and not overwrite:
                    print(f"SKIP already parsed: {lesson_title}")
                    skipped += 1
                    continue

                print(f"PROCESS: {lesson_title} ({start_page}-{end_page})")

                try:
                    pages = render_pages(pdf_path, start_page, end_page)
                    blocks = ask_openai_for_blocks_with_retry(lesson_title, pages)

                    payload = {
                        "grade_name": book["grade_name"],
                        "textbook_title": book["title"],
                        "series_name": book["series_name"],
                        "chapter_title": chapter["title"],
                        "lesson_title": lesson_title,
                        "start_page": start_page,
                        "end_page": end_page,
                        "blocks": blocks
                    }

                    with open(out_path, "w", encoding="utf-8") as f:
                        json.dump(payload, f, ensure_ascii=False, indent=2)

                    print(f"✅ saved: {out_path}")
                    success += 1

                except Exception as e:
                    print(f"❌ ERROR lesson={lesson_title}: {e}")
                    failed += 1

    print("\nFINISH")
    print(f"Total selected: {total}")
    print(f"Success: {success}")
    print(f"Skipped: {skipped}")
    print(f"Failed: {failed}")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--manifest",
        default="textbook_manifest.json",
        help="Path to textbook manifest JSON"
    )
    parser.add_argument(
        "--lessons",
        nargs="*",
        help="Only process exact lesson titles"
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Re-parse even if output JSON already exists"
    )

    args = parser.parse_args()

    manifest = load_manifest(args.manifest)
    process_manifest(
        manifest=manifest,
        selected_lessons=args.lessons,
        overwrite=args.overwrite
    )

if __name__ == "__main__":
    main()