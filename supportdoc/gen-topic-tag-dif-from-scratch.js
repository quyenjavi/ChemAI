require("dotenv").config({ path: ".env" });

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const OpenAI = require("openai");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = "gpt-4o-mini";
const BATCH_SIZE = 5;
const FETCH_LIMIT = 300;
const MAX_RETRY_MISSING = 1;
const MAX_RETRY_INVALID_JSON = 1;

const OUTPUT_SQL = "update_questions_missing_topic_difficulty_tags.sql";
const DEBUG_RESPONSE_FILE = "debug_ai_response.txt";

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function escapeSql(value) {
  if (value === null || value === undefined || value === "") return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function escapePgTextArray(arr) {
  if (!arr || !Array.isArray(arr) || arr.length === 0) {
    return "ARRAY[]::text[]";
  }

  const values = arr.map((item) => escapeSql(String(item)));
  return `ARRAY[${values.join(", ")}]::text[]`;
}

function normalizeDifficulty(value) {
  const n = Number(value);
  if (n === 1 || n === 2 || n === 3) return n;
  return 2;
}

function slugifyTag(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];

  return [
    ...new Set(
      tags
        .map((t) => slugifyTag(t))
        .filter(Boolean)
        .slice(0, 6)
    ),
  ];
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
  if (!candidate) {
    throw new Error("No JSON array found in model response");
  }
  return JSON.parse(candidate);
}

async function fetchQuestions(limit = FETCH_LIMIT) {
  const { data: questions, error } = await supabase
    .from("questions")
    .select(`
      id,
      lesson_id,
      content,
      brief_content,
      question_type,
      topic,
      difficulty,
      tags,
      created_at
    `)
    .or("topic.is.null,difficulty.is.null,tags.is.null")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  if (!questions || questions.length === 0) return [];

  const lessonIds = [...new Set(questions.map((q) => q.lesson_id).filter(Boolean))];

  const { data: lessons, error: lessonError } = await supabase
    .from("lessons")
    .select(`
      id,
      title,
      description,
      lesson_type,
      grade_id
    `)
    .in("id", lessonIds);

  if (lessonError) throw lessonError;

  const lessonMap = new Map((lessons || []).map((l) => [l.id, l]));

  return questions.map((q) => {
    const lesson = lessonMap.get(q.lesson_id) || {};

    return {
      question_id: q.id,
      lesson_id: q.lesson_id,
      content: q.content || "",
      brief_content: q.brief_content || "",
      question_type: q.question_type || "",
      current_topic: q.topic,
      current_difficulty: q.difficulty,
      current_tags: q.tags,
      lesson_title: lesson.title || "",
      lesson_description: lesson.description || "",
      lesson_type: lesson.lesson_type || "",
      grade_id: lesson.grade_id || "",
    };
  });
}

function buildPrompt(items) {
  return `
Bạn là giáo viên Hóa học THPT phụ trách gắn metadata cho ngân hàng câu hỏi.

Nhiệm vụ:
Dựa vào:
- nội dung câu hỏi
- brief_content nếu có
- tên bài học (lesson_title)
- mô tả bài học (lesson_description) nếu có
- loại câu hỏi (question_type)

Hãy sinh cho mỗi câu:
1. topic: 1 chủ đề ngắn, rõ ràng, sát chương/bài
2. difficulty: số nguyên từ 1 đến 3
   - 1 = dễ
   - 2 = trung bình
   - 3 = khó
3. tags: BẮT BUỘC là mảng từ 3 đến 6 tag ngắn, lowercase, không dấu, ngăn bằng dấu gạch dưới nếu cần

Yêu cầu:
- PHẢI giữ nguyên question_id của từng item input.
- Không bỏ sót item nào.
- Không được thêm bất kỳ câu dẫn, giải thích, markdown, hay code fence nào.
- Output phải bắt đầu bằng [ và kết thúc bằng ].
- topic phải ngắn, đúng chuyên môn, không quá chung chung.
- tags phải luôn có ít nhất 3 phần tử.
- tags phải bám vào:
  + chất / nhóm chất
  + dạng bài
  + khái niệm trọng tâm
  + kỹ năng nếu phù hợp
- Ví dụ tag tốt: ester, thuy_phan_ester, nhan_biet, tinh_toan_nhe, polymer, so_oxi_hoa
- Không bịa ngoài nội dung câu hỏi và lesson.
- Nếu lesson_title đã rõ, ưu tiên bám theo lesson_title.
- Chỉ trả về JSON array.
- Trả đủ đúng số phần tử input.

Format bắt buộc:
[
  {
    "question_id": "...",
    "topic": "...",
    "difficulty": 1,
    "tags": ["...", "...", "..."]
  }
]

Dữ liệu:
${JSON.stringify(items, null, 2)}
`;
}

async function callModel(batch) {
  const prompt = buildPrompt(batch);

  const response = await openai.responses.create({
    model: MODEL,
    input: prompt,
  });

  return response.output_text?.trim() || "";
}

function inferTagsFromText(text) {
  const t = slugifyTag(text).replace(/_/g, " ");
  const tags = [];

  const mapping = [
    ["ester", "ester"],
    ["thuy phan", "thuy_phan"],
    ["xa phong hoa", "xa_phong_hoa"],
    ["amine", "amine"],
    ["amino acid", "amino_acid"],
    ["amoniac", "amoniac"],
    ["muoi amoni", "muoi_amoni"],
    ["polymer", "polymer"],
    ["glucose", "glucose"],
    ["fructose", "fructose"],
    ["saccharose", "saccharose"],
    ["tinh bot", "tinh_bot"],
    ["cellulose", "cellulose"],
    ["protein", "protein"],
    ["lipit", "lipit"],
    ["chat beo", "chat_beo"],
    ["carbohydrate", "carbohydrate"],
    ["so oxi hoa", "so_oxi_hoa"],
    ["phan ung", "phan_ung"],
    ["cong thuc", "cong_thuc"],
    ["danh phap", "danh_phap"],
    ["dong phan", "dong_phan"],
    ["nhan biet", "nhan_biet"],
    ["tinh che", "tinh_che"],
    ["tach chiet", "tach_chiet"],
    ["dieu che", "dieu_che"],
    ["hoi dap dung sai", "dung_sai"],
  ];

  for (const [needle, tag] of mapping) {
    if (t.includes(needle)) tags.push(tag);
  }

  return [...new Set(tags)];
}

function buildFallbackTags(item, generatedTopic) {
  const tags = [];

  const lessonTags = inferTagsFromText(item.lesson_title || "");
  const topicTags = inferTagsFromText(generatedTopic || "");
  const contentTags = inferTagsFromText(
    `${item.content || ""} ${item.brief_content || ""}`
  );

  tags.push(...lessonTags);
  tags.push(...topicTags);
  tags.push(...contentTags);

  if (item.question_type) {
    tags.push(slugifyTag(item.question_type));
  }

  if (generatedTopic) {
    tags.push(slugifyTag(generatedTopic));
  }

  // fallback dạng bài phổ thông
  if (!tags.includes("nhan_biet") && normalizeDifficulty(item.current_difficulty || 2) === 1) {
    tags.push("nhan_biet");
  }

  const finalTags = [...new Set(tags.filter(Boolean))].slice(0, 6);

  // ép tối thiểu 3 tags
  if (finalTags.length < 3) {
    if (!finalTags.includes("hoa_huu_co")) finalTags.push("hoa_huu_co");
    if (!finalTags.includes("trac_nghiem")) finalTags.push("trac_nghiem");
    if (!finalTags.includes("on_tap")) finalTags.push("on_tap");
  }

  return [...new Set(finalTags)].slice(0, 6);
}

async function generateBatch(
  batch,
  missingRetryCount = MAX_RETRY_MISSING,
  jsonRetryCount = MAX_RETRY_INVALID_JSON
) {
  const text = await callModel(batch);

  let parsed;
  try {
    parsed = safeJsonParseArray(text);
  } catch (err) {
    fs.writeFileSync(DEBUG_RESPONSE_FILE, text || "", "utf8");

    console.error("=== RAW AI RESPONSE START ===");
    console.error(text);
    console.error("=== RAW AI RESPONSE END ===");

    if (jsonRetryCount > 0) {
      console.warn("Retrying batch because response was not valid JSON...");
      return await generateBatch(batch, missingRetryCount, jsonRetryCount - 1);
    }

    throw new Error("AI response is not valid JSON");
  }

  if (!Array.isArray(parsed)) {
    fs.writeFileSync(DEBUG_RESPONSE_FILE, text || "", "utf8");

    console.error("=== RAW AI RESPONSE START ===");
    console.error(text);
    console.error("=== RAW AI RESPONSE END ===");
    throw new Error("AI response is not an array");
  }

  const byId = new Map();

  for (const item of parsed) {
    if (!item || !item.question_id) continue;

    byId.set(item.question_id, {
      question_id: item.question_id,
      topic: typeof item.topic === "string" ? item.topic.trim() : null,
      difficulty: normalizeDifficulty(item.difficulty),
      tags: normalizeTags(item.tags),
    });
  }

  const missing = batch.filter((x) => !byId.has(x.question_id));

  if (missing.length > 0) {
    console.warn(`Warning: missing ${missing.length}/${batch.length} questions.`);
    console.warn("Missing IDs:", missing.map((x) => x.question_id));

    if (missingRetryCount > 0) {
      console.warn(`Retrying ${missing.length} missing questions...`);
      const retried = await generateBatch(
        missing,
        missingRetryCount - 1,
        jsonRetryCount
      );

      for (const item of retried) {
        byId.set(item.question_id, item);
      }
    }
  }

  return batch.map((item) => {
    const found = byId.get(item.question_id);
    const generatedTopic = found?.topic || item.lesson_title || null;
    const generatedDifficulty = found?.difficulty || 2;

    let generatedTags = found?.tags || [];
    if (!generatedTags.length) {
      generatedTags = buildFallbackTags(item, generatedTopic);
    }

    return {
      question_id: item.question_id,
      generated_topic: generatedTopic,
      generated_difficulty: generatedDifficulty,
      generated_tags: generatedTags,
      current_topic: item.current_topic,
      current_difficulty: item.current_difficulty,
      current_tags: item.current_tags,
    };
  });
}

function buildUpdateSql(rows) {
  const values = rows
    .map(
      (r) => `(
  '${r.id}'::uuid,
  ${escapeSql(r.topic)}::text,
  ${r.difficulty === null || r.difficulty === undefined ? "NULL" : r.difficulty}::integer,
  ${escapePgTextArray(r.tags)}
)`
    )
    .join(",\n");

  return `UPDATE questions AS q
SET
  topic = COALESCE(q.topic, v.topic),
  difficulty = COALESCE(q.difficulty, v.difficulty),
  tags = COALESCE(q.tags, v.tags)
FROM (
  VALUES
${values}
) AS v(id, topic, difficulty, tags)
WHERE q.id = v.id
  AND (
    q.topic IS NULL
    OR q.difficulty IS NULL
    OR q.tags IS NULL
  );`;
}

async function main() {
  console.log("Fetching questions missing topic/difficulty/tags...");
  const questions = await fetchQuestions();

  console.log(`Found ${questions.length} questions.`);
  if (!questions.length) {
    console.log("No questions need update.");
    return;
  }

  const batches = chunkArray(questions, BATCH_SIZE);
  const sqlBlocks = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`Processing batch ${i + 1}/${batches.length}...`);

    const generated = await generateBatch(batch);

    const rows = generated.map((item) => ({
      id: item.question_id,
      topic: item.current_topic ?? item.generated_topic,
      difficulty: item.current_difficulty ?? item.generated_difficulty,
      tags:
        Array.isArray(item.current_tags) && item.current_tags.length > 0
          ? item.current_tags
          : item.generated_tags,
    }));

    sqlBlocks.push(buildUpdateSql(rows));
  }

  const finalSql = sqlBlocks.join("\n\n");
  const outputPath = path.resolve(process.cwd(), OUTPUT_SQL);

  fs.writeFileSync(outputPath, finalSql, "utf8");
  console.log(`Done. SQL written to: ${outputPath}`);
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});