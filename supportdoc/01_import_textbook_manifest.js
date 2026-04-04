require("dotenv").config({ path: ".env" });

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const MANIFEST_PATH = path.resolve(process.cwd(), "textbook_manifest.json");

const GRADE_ID_MAP = {
  "10": "11111111-1111-1111-1111-111111111110",
  "11": "11111111-1111-1111-1111-111111111111",
  "12": "11111111-1111-1111-1111-111111111112"
};

function normalizeText(text = "") {
  return String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

async function upsertTextbook(book) {
  const payload = {
    title: book.title,
    series_name: book.series_name,
    grade_id: GRADE_ID_MAP[String(book.grade_name)] || null,
    subject: "Hóa học",
    curriculum: book.series_name,
    source_pdf_filename: book.source_pdf_filename || null
  };

  const { data: existing, error: findError } = await supabase
    .from("textbooks")
    .select("id")
    .eq("title", book.title)
    .eq("series_name", book.series_name)
    .maybeSingle();

  if (findError) throw findError;

  if (existing) {
    const { data, error } = await supabase
      .from("textbooks")
      .update(payload)
      .eq("id", existing.id)
      .select("id")
      .single();

    if (error) throw error;
    return data.id;
  }

  const { data, error } = await supabase
    .from("textbooks")
    .insert(payload)
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

async function upsertChapter(textbookId, chapter, sortOrder) {
  const payload = {
    textbook_id: textbookId,
    chapter_number: chapter.chapter_number ?? null,
    title: chapter.title,
    normalized_title: normalizeText(chapter.title),
    start_page: chapter.start_page ?? null,
    end_page: chapter.end_page ?? null,
    sort_order: sortOrder
  };

  const { data: existing, error: findError } = await supabase
    .from("textbook_chapters")
    .select("id")
    .eq("textbook_id", textbookId)
    .eq("title", chapter.title)
    .maybeSingle();

  if (findError) throw findError;

  if (existing) {
    const { data, error } = await supabase
      .from("textbook_chapters")
      .update(payload)
      .eq("id", existing.id)
      .select("id")
      .single();

    if (error) throw error;
    return data.id;
  }

  const { data, error } = await supabase
    .from("textbook_chapters")
    .insert(payload)
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

async function upsertLesson(textbookId, chapterId, lesson, sortOrder) {
  const payload = {
    textbook_id: textbookId,
    chapter_id: chapterId,
    lesson_number: lesson.lesson_number ?? null,
    title: lesson.title,
    normalized_title: normalizeText(lesson.title),
    start_page: lesson.start_page ?? null,
    end_page: lesson.end_page ?? null,
    sort_order: sortOrder
  };

  const { data: existing, error: findError } = await supabase
    .from("textbook_lessons")
    .select("id")
    .eq("textbook_id", textbookId)
    .eq("title", lesson.title)
    .maybeSingle();

  if (findError) throw findError;

  if (existing) {
    const { data, error } = await supabase
      .from("textbook_lessons")
      .update(payload)
      .eq("id", existing.id)
      .select("id")
      .single();

    if (error) throw error;
    return data.id;
  }

  const { data, error } = await supabase
    .from("textbook_lessons")
    .insert(payload)
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));

  for (const book of manifest) {
    console.log(`\n📘 Import textbook: ${book.title} - ${book.series_name}`);
    const textbookId = await upsertTextbook(book);

    let chapterSort = 1;
    let lessonSortGlobal = 1;

    for (const chapter of book.chapters || []) {
      const chapterId = await upsertChapter(textbookId, chapter, chapterSort++);

      for (const lesson of chapter.lessons || []) {
        await upsertLesson(textbookId, chapterId, lesson, lessonSortGlobal++);
        console.log(`   ✅ Lesson: ${lesson.title}`);
      }
    }
  }

  console.log("\nFINISH");
}

main().catch((err) => {
  console.error("ERROR:", err.message || err);
  process.exit(1);
});