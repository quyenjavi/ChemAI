import os
import json
import uuid
import mimetypes
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import quote

import requests
from dotenv import load_dotenv

load_dotenv(".env")

# =========================================================
# FIXED CONFIG
# =========================================================
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
BUCKET = "ChemAI"

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env")


# =========================================================
# HELPERS
# =========================================================
def api_headers(prefer_return: bool = False) -> Dict[str, str]:
    headers = {
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "apikey": SUPABASE_KEY,
        "Content-Type": "application/json",
    }
    if prefer_return:
        headers["Prefer"] = "return=representation"
    return headers


def safe_request(method: str, url: str, retries: int = 3, **kwargs):
    last_err = None
    for i in range(retries):
        try:
            return requests.request(method, url, timeout=60, **kwargs)
        except Exception as e:
            last_err = e
            print(f"⚠️ Request retry {i+1}/{retries}: {e}")
    raise last_err


def upload_binary(storage_path: str, data: bytes, content_type: str) -> Optional[str]:
    safe_path = quote(storage_path)
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{safe_path}"
    headers = {
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "apikey": SUPABASE_KEY,
        "Content-Type": content_type,
        "x-upsert": "true"
    }

    r = safe_request("POST", url, headers=headers, data=data)
    if r.status_code >= 400:
        print("❌ UPLOAD ERROR:", r.status_code, r.text)
        return None

    return f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{safe_path}"


def normalize_text_for_display(text: Optional[str]) -> Optional[str]:
    if not text:
        return text
    return text.strip()


def create_lesson(title: str, grade_id: str) -> str:
    url = f"{SUPABASE_URL}/rest/v1/lessons"
    payload = {
        "title": title,
        "grade_id": grade_id,
        "lesson_type": "practice",
        "is_visible": False,
        "question_count": 0
    }

    r = safe_request("POST", url, headers=api_headers(prefer_return=True), json=payload)
    if r.status_code >= 400:
        raise RuntimeError(f"Create lesson failed: {r.status_code} - {r.text}")

    data = r.json()
    if isinstance(data, list) and data:
        return data[0]["id"]
    if isinstance(data, dict) and "id" in data:
        return data["id"]
    raise RuntimeError(f"Unexpected create_lesson response: {data}")


def insert_question(lesson_id: str, q: Dict[str, Any], image_url: Optional[str]) -> Optional[str]:
    url = f"{SUPABASE_URL}/rest/v1/questions"
    payload = {
        "lesson_id": lesson_id,
        "content": normalize_text_for_display(q.get("content")),
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

    r = safe_request("POST", url, headers=api_headers(prefer_return=True), json=payload)
    if r.status_code >= 400:
        print("❌ INSERT QUESTION ERROR:", r.status_code, r.text)
        return None

    data = r.json()
    if isinstance(data, list):
        return data[0]["id"] if data else None
    if isinstance(data, dict) and "id" in data:
        return data["id"]
    return None


def insert_bulk(table: str, rows: List[Dict[str, Any]]) -> bool:
    if not rows:
        return True

    url = f"{SUPABASE_URL}/rest/v1/{table}"
    r = safe_request("POST", url, headers=api_headers(prefer_return=False), json=rows)
    if r.status_code >= 400:
        print(f"❌ INSERT {table} ERROR:", r.status_code, r.text)
        return False
    return True


def update_question_count(lesson_id: str) -> None:
    count_url = f"{SUPABASE_URL}/rest/v1/questions?lesson_id=eq.{lesson_id}&select=id"
    r = safe_request("GET", count_url, headers=api_headers())
    r.raise_for_status()
    cnt = len(r.json())

    patch_url = f"{SUPABASE_URL}/rest/v1/lessons?id=eq.{lesson_id}"
    r2 = safe_request("PATCH", patch_url, headers=api_headers(), json={"question_count": cnt})
    r2.raise_for_status()


# =========================================================
# MAIN
# =========================================================
def main():
    extract_json_path = input("📄 Path to extract_result.json: ").strip()
    import_reviewed_only = input("✅ Import only status=ok ? (y/n, default n): ").strip().lower() == "y"

    extract_path = Path(extract_json_path)
    if not extract_path.exists():
        raise FileNotFoundError(extract_json_path)

    base_dir = extract_path.parent
    asset_manifest_path = base_dir / "assets_manifest.json"

    with open(extract_path, "r", encoding="utf-8") as f:
        extract_result = json.load(f)

    assets_manifest = {}
    if asset_manifest_path.exists():
        with open(asset_manifest_path, "r", encoding="utf-8") as f:
            assets_manifest = json.load(f)

    lesson_title = extract_result["lesson_title"]
    grade_id = extract_result["grade_id"]
    questions = extract_result["questions"]

    if import_reviewed_only:
        questions = [q for q in questions if q.get("status") == "ok"]

    lesson_id = create_lesson(lesson_title, grade_id)
    print("✅ Lesson created:", lesson_id)

    imported = 0
    skipped = []

    for q in questions:
        qtype = q.get("question_type")
        qnum = q.get("question_number")

        if qtype not in {"single_choice", "true_false_group", "short_answer"}:
            skipped.append({"question_number": qnum, "reason": "invalid_question_type"})
            continue

        image_url = None
        local_keys = q.get("local_image_keys", []) or []

        if q.get("has_image_or_table") and local_keys:
            first_key = local_keys[0]
            local_path = assets_manifest.get(first_key)
            if local_path and Path(local_path).exists():
                mime = mimetypes.guess_type(local_path)[0] or "image/png"
                ext = Path(local_path).suffix or ".png"
                storage_path = f"questions/{uuid.uuid4().hex}{ext}"
                image_url = upload_binary(storage_path, Path(local_path).read_bytes(), mime)

        qid = insert_question(lesson_id, q, image_url=image_url)
        if not qid:
            skipped.append({"question_number": qnum, "reason": "insert_question_failed"})
            continue

        ok = True

        if qtype == "single_choice":
            rows = []
            for idx, o in enumerate(q.get("options", []), start=1):
                rows.append({
                    "question_id": qid,
                    "option_key": o.get("key"),
                    "option_text": o.get("text"),
                    "is_correct": o.get("is_correct", False),
                    "sort_order": idx
                })
            ok = insert_bulk("question_options", rows)

        elif qtype == "true_false_group":
            rows = []
            for idx, s in enumerate(q.get("statements", []), start=1):
                rows.append({
                    "question_id": qid,
                    "statement_key": s.get("key"),
                    "statement_text": s.get("text"),
                    "correct_answer": s.get("correct_answer", False),
                    "sort_order": idx,
                    "score": 0.25,
                    "explanation": s.get("explanation"),
                    "tip": s.get("tip")
                })
            ok = insert_bulk("question_statements", rows)

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
            ok = insert_bulk("question_short_answers", rows)

        if not ok:
            skipped.append({"question_number": qnum, "reason": "insert_child_failed"})
            continue

        imported += 1
        print(f"✔ Imported Q{qnum}")

    update_question_count(lesson_id)

    report = {
        "lesson_id": lesson_id,
        "lesson_title": lesson_title,
        "imported": imported,
        "skipped": skipped
    }
    with open(base_dir / "import_report.json", "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print(f"\n🎉 DONE IMPORT. Imported {imported} questions")
    print(f"📄 Report: {base_dir / 'import_report.json'}")


if __name__ == "__main__":
    main()
