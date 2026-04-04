require("dotenv").config({ path: ".env" });

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const PARSED_DIR = path.resolve(process.cwd(), "parsed_textbook_blocks");

function normalizeText(text = "") {
  return String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

async function findTextbook(title, seriesName) {
  const { data, error } = await supabase
    .from("textbooks")
    .select("id")
    .eq("title", title)
    .eq("series_name", seriesName)
    .single();

  if (error) throw error;
  return data.id;
}

async function findChapter(textbookId, chapterTitle) {
  const { data, error } = await supabase
    .from("textbook_chapters")
    .select("id")
    .eq("textbook_id", textbookId)
    .eq("title", chapterTitle)
    .single();

  if (error) throw error;
  return data.id;
}

async function findLesson(textbookId, lessonTitle) {
  const { data, error } = await supabase
    .from("textbook_lessons")
    .select("id")
    .eq("textbook_id", textbookId)
    .eq("title", lessonTitle)
    .single();

  if (error) throw error;
  return data.id;
}

async function deleteOldBlocks(lessonId) {
  const { error } = await supabase
    .from("textbook_lesson_blocks")
    .delete()
    .eq("lesson_id", lessonId);

  if (error) throw error;
}

async function insertBlocks(textbookId, chapterId, lessonId, blocks) {
  if (!blocks.length) return;

  const rows = blocks.map((b, idx) => ({
    textbook_id: textbookId,
    chapter_id: chapterId,
    lesson_id: lessonId,
    block_type: b.block_type || "other",
    title: b.title || null,
    content: b.content || null,
    page_number: b.page_number || null,
    page_range_start: b.page_number || null,
    page_range_end: b.page_number || null,
    sort_order: idx + 1,
    has_figure: !!b.has_figure,
    has_table: !!b.has_table,
    has_formula: !!b.has_formula,
    metadata: {
      extracted_by: "openai_pdf_pipeline"
    }
  }));

  const { error } = await supabase
    .from("textbook_lesson_blocks")
    .insert(rows);

  if (error) throw error;
}

async function markLessonDone(lessonId) {
  const { error } = await supabase
    .from("textbook_lessons")
    .update({ source_status: "done" })
    .eq("id", lessonId);

  if (error) throw error;
}

async function main() {
  const files = fs.readdirSync(PARSED_DIR).filter((f) => f.endsWith(".json"));

  for (const file of files) {
    const fullPath = path.join(PARSED_DIR, file);
    const payload = JSON.parse(fs.readFileSync(fullPath, "utf8"));

    console.log(`\n📥 Import blocks: ${payload.lesson_title}`);

    const textbookId = await findTextbook(payload.textbook_title, payload.series_name);
    const chapterId = await findChapter(textbookId, payload.chapter_title);
    const lessonId = await findLesson(textbookId, payload.lesson_title);

    await deleteOldBlocks(lessonId);
    await insertBlocks(textbookId, chapterId, lessonId, payload.blocks || []);
    await markLessonDone(lessonId);

    console.log(`✅ Done: ${payload.lesson_title}`);
  }

  console.log("\nFINISH");
}

main().catch((err) => {
  console.error("ERROR:", err.message || err);
  process.exit(1);
});