require("dotenv").config({ path: ".env" });

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const OpenAI = require("openai");

const UNIT_SCHEMA = require("./unit_schema.json");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = "gpt-4o-mini";
const BATCH_SIZE = 8;
const FETCH_LIMIT_PER_LESSON = 5000;
const DEBUG_DIR = path.resolve(process.cwd(), "debug-topic-unit-difficulty");
const LOG_FILE = path.resolve(process.cwd(), "topic-unit-difficulty-run.log");

if (!fs.existsSync(DEBUG_DIR)) {
  fs.mkdirSync(DEBUG_DIR, { recursive: true });
}

const FIELD_CONFIG = {
  topic_unit: {
    dbColumn: "topic_unit",
    description:
      "Đơn vị kiến thức nhỏ hơn bài/chương, chỉ được chọn trong danh sách unit hợp lệ.",
    sqlType: "text",
    normalize: normalizeTopicUnit,
  },
  difficulty_academic: {
    dbColumn: "difficulty_academic",
    description:
      "Mức độ học thuật theo ma trận: biet | hieu | van_dung | van_dung_cao.",
    sqlType: "text",
    normalize: normalizeDifficultyAcademic,
  },
};

function logLine(...args) {
  const line =
    `[${new Date().toISOString()}] ` +
    args.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ");
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + "\n", "utf8");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeForMatch(text = "") {
  return String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s || null;
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function extractJsonArray(text) {
  if (!text) return null;

  const trimmed = text.trim();

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed;
  }

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch && fenceMatch[1]) {
    const inside = fenceMatch[1].trim();
    const start = inside.indexOf("[");
    const end = inside.lastIndexOf("]");
    if (start !== -1 && end !== -1 && end > start) {
      return inside.slice(start, end + 1);
    }
  }

  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start !== -1 && end !== -1 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return null;
}

function safeJsonParseArray(text) {
  const candidate = extractJsonArray(text);
  if (!candidate) throw new Error("No JSON array found in model response");
  return JSON.parse(candidate);
}

function normalizeDifficultyAcademic(value) {
  const raw = normalizeText(value);
  if (!raw) return "hieu";

  const lower = normalizeForMatch(raw);

  if (["biet", "nhan biet", "nhan_biet"].includes(lower)) return "biet";
  if (["hieu", "thong hieu", "thong_hieu"].includes(lower)) return "hieu";
  if (["van dung", "van_dung", "vd"].includes(lower)) return "van_dung";
  if (["van dung cao", "van_dung_cao", "vdc"].includes(lower))
    return "van_dung_cao";

  return "hieu";
}

function getSchemaUnits(schemaItem) {
  return Array.isArray(schemaItem?.academic_units) ? schemaItem.academic_units : [];
}

function normalizeTopicUnit(value, context = {}) {
  const raw = normalizeText(value);
  const schemaItem = context.schemaItem;
  const units = getSchemaUnits(schemaItem);

  if (!units.length) return raw || null;
  if (!raw) return units[0];

  const lower = normalizeForMatch(raw);

  for (const unit of units) {
    if (normalizeForMatch(unit) === lower) {
      return unit;
    }
  }

  for (const unit of units) {
    const unitNorm = normalizeForMatch(unit);
    if (lower.includes(unitNorm) || unitNorm.includes(lower)) {
      return unit;
    }
  }

  const keywordMap = [];
  for (const unit of units) {
    const parts = normalizeForMatch(unit).split(" ");
    keywordMap.push({
      unit,
      score: parts.filter((p) => p && lower.includes(p)).length,
    });
  }

  keywordMap.sort((a, b) => b.score - a.score);
  if (keywordMap[0] && keywordMap[0].score > 0) {
    return keywordMap[0].unit;
  }

  return units[0];
}

function buildUnitSchemaText(schemaItem) {
  const topic = schemaItem?.academic_topic || "Không rõ topic";
  const units = getSchemaUnits(schemaItem);

  if (!units.length) {
    return `Topic: ${topic}\nKhông có unit hợp lệ.`;
  }

  return `Topic: ${topic}\nCác unit hợp lệ:\n${units.map((u) => `- ${u}`).join("\n")}`;
}

function buildPrompt(items, fields, schemaItem) {
  const schemaText = buildUnitSchemaText(schemaItem);

  const requestedSchema = fields
    .map((field) => {
      if (field === "topic_unit") return `"topic_unit": "..."`;
      if (field === "difficulty_academic") {
        return `"difficulty_academic": "biet|hieu|van_dung|van_dung_cao"`;
      }
      return `"${field}": "..."`;
    })
    .join(",\n    ");

  return `
Bạn là giáo viên Hóa học THPT phụ trách gắn metadata cho ngân hàng câu hỏi.

Nhiệm vụ:
Dựa vào:
- nội dung câu hỏi
- brief_content nếu có
- lesson_title
- question_type nếu có
- academic_topic của bài

Hãy trả về cho mỗi câu:
${fields.map((f) => `- ${f}: ${FIELD_CONFIG[f].description}`).join("\n")}

QUY TẮC BẮT BUỘC:
- topic_unit PHẢI chọn đúng 1 giá trị từ danh sách unit hợp lệ dưới đây.
- Không được tạo topic_unit mới ngoài danh sách.
- difficulty_academic chỉ được là: biet, hieu, van_dung, van_dung_cao.
- Nếu câu dễ nhận biết/khái niệm trực tiếp => ưu tiên biet.
- Nếu câu cần hiểu bản chất, giải thích, so sánh => hieu.
- Nếu câu cần suy luận/tính toán một bước hoặc áp dụng công thức => van_dung.
- Nếu câu nhiều bước, phối hợp nhiều ý, suy luận sâu => van_dung_cao.
- Phải giữ nguyên question_id.
- Không được bỏ sót item nào.
- Không markdown, không giải thích, không code fence.
- Chỉ trả về JSON array hợp lệ.

Thông tin bài:
lesson_title: ${schemaItem.lesson_title}
academic_topic: ${schemaItem.academic_topic}
schema_type: ${schemaItem.schema_type}

Danh sách unit hợp lệ:
${schemaText}

Format bắt buộc:
[
  {
    "question_id": "...",
    ${requestedSchema}
  }
]

Dữ liệu:
${JSON.stringify(items, null, 2)}
`;
}

async function callModel(batch, fields, schemaItem) {
  const prompt = buildPrompt(batch, fields, schemaItem);

  const response = await openai.responses.create({
    model: MODEL,
    input: prompt,
  });

  return response.output_text ? response.output_text.trim() : "";
}

async function generateBatch(batch, fields, schemaItem, debugKey) {
  const text = await callModel(batch, fields, schemaItem);

  let parsed;
  try {
    parsed = safeJsonParseArray(text);
  } catch (err) {
    const debugPath = path.join(DEBUG_DIR, `${debugKey}.txt`);
    fs.writeFileSync(debugPath, text || "", "utf8");
    throw new Error(`AI response is not valid JSON. Debug saved: ${debugPath}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error("AI response is not an array");
  }

  const byId = new Map();

  for (const item of parsed) {
    if (!item || !item.question_id) continue;

    const src = batch.find((x) => x.question_id === item.question_id);
    if (!src) continue;

    byId.set(item.question_id, {
      question_id: item.question_id,
      topic_unit: normalizeTopicUnit(item.topic_unit, {
        ...src,
        schemaItem,
      }),
      difficulty_academic: normalizeDifficultyAcademic(item.difficulty_academic),
    });
  }

  return batch.map((src) => {
    const found = byId.get(src.question_id) || {};

    return {
      question_id: src.question_id,
      values: {
        topic_unit: src.current_values.topic_unit ?? found.topic_unit ?? null,
        difficulty_academic:
          src.current_values.difficulty_academic ??
          found.difficulty_academic ??
          null,
      },
    };
  });
}

async function fetchAllLessonsWithGrade() {
  const { data, error } = await supabase
    .from("lessons")
    .select(`
      id,
      title,
      description,
      lesson_type,
      grade_id,
      created_at,
      grades!inner (
        id,
        name
      )
    `)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data || []).map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description || "",
    lesson_type: row.lesson_type || "",
    grade_id: row.grade_id || "",
    created_at: row.created_at,
    grade_name: String(row.grades?.name || "").trim(),
  }));
}

function findDbLessonForSchema(schemaItem, dbLessons) {
  const gradeName = String(schemaItem.grade_name || "").trim();
  const lessonTitleNorm = normalizeForMatch(schemaItem.lesson_title || "");

  const sameGrade = dbLessons.filter(
    (l) => String(l.grade_name || "").trim() === gradeName
  );

  let exact = sameGrade.find(
    (l) => normalizeForMatch(l.title || "") === lessonTitleNorm
  );
  if (exact) return exact;

  let includeMatch = sameGrade.find((l) => {
    const a = normalizeForMatch(l.title || "");
    return a.includes(lessonTitleNorm) || lessonTitleNorm.includes(a);
  });
  if (includeMatch) return includeMatch;

  return null;
}

async function fetchQuestionsByLesson(lesson, limit = FETCH_LIMIT_PER_LESSON, fields = ["topic_unit", "difficulty_academic"]) {
  const selectFields = [
    "id",
    "lesson_id",
    "content",
    "brief_content",
    "question_type",
    "topic",
    "difficulty",
    "tags",
    "created_at",
    ...fields.map((f) => FIELD_CONFIG[f].dbColumn),
  ];

  const orConditions = fields
    .map((f) => `${FIELD_CONFIG[f].dbColumn}.is.null`)
    .join(",");

  const { data: questions, error } = await supabase
    .from("questions")
    .select(selectFields.join(","))
    .eq("lesson_id", lesson.id)
    .or(orConditions)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  if (!questions || questions.length === 0) return [];

  return questions.map((q) => ({
    question_id: q.id,
    lesson_id: q.lesson_id,
    content: q.content || "",
    brief_content: q.brief_content || "",
    question_type: q.question_type || "",
    lesson_title: lesson.title || "",
    lesson_description: lesson.description || "",
    lesson_type: lesson.lesson_type || "",
    grade_id: lesson.grade_id || "",
    current_values: Object.fromEntries(
      fields.map((f) => [f, q[FIELD_CONFIG[f].dbColumn] ?? null])
    ),
  }));
}

async function updateQuestionRow(questionId, values) {
  const payload = {};

  if (values.topic_unit !== null && values.topic_unit !== undefined) {
    payload.topic_unit = values.topic_unit;
  }
  if (
    values.difficulty_academic !== null &&
    values.difficulty_academic !== undefined
  ) {
    payload.difficulty_academic = values.difficulty_academic;
  }

  if (!Object.keys(payload).length) {
    return { updated: false, reason: "no_payload" };
  }

  const { error } = await supabase
    .from("questions")
    .update(payload)
    .eq("id", questionId);

  if (error) throw error;
  return { updated: true };
}

async function processLesson(schemaItem, dbLesson, fields) {
  const questions = await fetchQuestionsByLesson(dbLesson, FETCH_LIMIT_PER_LESSON, fields);

  if (!questions.length) {
    logLine(`SKIP lesson="${dbLesson.title}" reason="no_null_questions"`);
    return {
      lesson_title: dbLesson.title,
      status: "skipped",
      reason: "no_null_questions",
      total_questions: 0,
      updated_rows: 0,
      failed_rows: 0,
      failed_batches: 0,
    };
  }

  const batches = chunkArray(questions, BATCH_SIZE);

  let updatedRows = 0;
  let failedRows = 0;
  let failedBatches = 0;

  logLine(
    `START lesson="${dbLesson.title}" total_questions=${questions.length} batches=${batches.length}`
  );

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const debugKey = `${normalizeForMatch(dbLesson.title).replace(/\s+/g, "_")}_batch_${i + 1}`;

    try {
      logLine(`  BATCH ${i + 1}/${batches.length} lesson="${dbLesson.title}"`);

      const generated = await generateBatch(batch, fields, schemaItem, debugKey);

      for (const row of generated) {
        try {
          await updateQuestionRow(row.question_id, row.values);
          updatedRows += 1;
        } catch (rowErr) {
          failedRows += 1;
          logLine(
            `    ROW_ERROR lesson="${dbLesson.title}" question_id="${row.question_id}" message="${rowErr.message}"`
          );
        }
      }

      await sleep(300);
    } catch (batchErr) {
      failedBatches += 1;
      failedRows += batch.length;
      logLine(
        `  BATCH_ERROR lesson="${dbLesson.title}" batch=${i + 1} message="${batchErr.message}"`
      );
      continue;
    }
  }

  logLine(
    `DONE lesson="${dbLesson.title}" updated_rows=${updatedRows} failed_rows=${failedRows} failed_batches=${failedBatches}`
  );

  return {
    lesson_title: dbLesson.title,
    status: "done",
    total_questions: questions.length,
    updated_rows: updatedRows,
    failed_rows: failedRows,
    failed_batches: failedBatches,
  };
}

async function main() {
  const fields = ["topic_unit", "difficulty_academic"];
  fs.writeFileSync(LOG_FILE, "", "utf8");

  logLine("RUN_START");

  const dbLessons = await fetchAllLessonsWithGrade();

  let totalLessons = 0;
  let matchedLessons = 0;
  let skippedSchema = 0;
  let doneLessons = 0;
  let totalUpdatedRows = 0;
  let totalFailedRows = 0;

  for (const schemaItem of UNIT_SCHEMA) {
    totalLessons += 1;

    // exam thì bỏ qua
    if (schemaItem.schema_type === "exam") {
      skippedSchema += 1;
      logLine(
        `SKIP schema lesson_title="${schemaItem.lesson_title}" reason="schema_type_exam"`
      );
      continue;
    }

    const dbLesson = findDbLessonForSchema(schemaItem, dbLessons);

    if (!dbLesson) {
      skippedSchema += 1;
      logLine(
        `SKIP schema lesson_title="${schemaItem.lesson_title}" grade="${schemaItem.grade_name}" reason="db_lesson_not_found"`
      );
      continue;
    }

    matchedLessons += 1;

    try {
      const result = await processLesson(schemaItem, dbLesson, fields);
      if (result.status === "done") {
        doneLessons += 1;
      }
      totalUpdatedRows += result.updated_rows || 0;
      totalFailedRows += result.failed_rows || 0;
    } catch (lessonErr) {
      logLine(
        `LESSON_ERROR lesson="${dbLesson.title}" message="${lessonErr.message}"`
      );
      continue;
    }
  }

  logLine("RUN_SUMMARY", {
    totalLessons,
    matchedLessons,
    skippedSchema,
    doneLessons,
    totalUpdatedRows,
    totalFailedRows,
  });

  logLine("FINISH");
}

main().catch((err) => {
  logLine("FATAL_ERROR", err.message || String(err));
  process.exit(1);
});