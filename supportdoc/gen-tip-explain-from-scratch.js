require("dotenv").config({ path: ".env" });

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const OpenAI = require("openai");

// ENV
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = "gpt-5.4-mini";
const BATCH_SIZE = 50;
const OUTPUT_SQL = "gen_from_scratch.sql";

// ================= UTIL =================
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function escapeSql(s) {
  if (!s) return "NULL";
  return `'${s.replace(/'/g, "''")}'`;
}

// ================= FETCH =================
async function fetchQuestions(limit = 300) {
  const { data, error } = await supabase
    .from("questions")
    .select("id, content, question_type")
    .is("tip", null)
    .is("explanation", null)
    .limit(limit);

  if (error) throw error;

  const ids = data.map((q) => q.id);

  // lấy đáp án
  const { data: opts } = await supabase
    .from("question_options")
    .select("question_id, option_key, option_text, is_correct")
    .in("question_id", ids);

  const optionsByQ = {};
  for (const o of opts || []) {
    optionsByQ[o.question_id] ||= [];
    optionsByQ[o.question_id].push(o);
  }

  return data.map((q) => ({
    question_id: q.id,
    content: q.content,
    answer_data: (optionsByQ[q.id] || [])
      .map(
        (o) =>
          `${o.option_key}. ${o.option_text}${
            o.is_correct ? " [ĐÚNG]" : ""
          }`
      )
      .join("\n"),
  }));
}

// ================= AI =================
async function genBatch(items) {
  const prompt = `
Bạn là giáo viên Hóa học THPT nhiều kinh nghiệm.

Nhiệm vụ:
Với mỗi câu hỏi, hãy tạo:
1. tip: 1 câu ngắn giúp học sinh định hướng cách làm
2. explanation: giải thích rõ ràng, đúng bản chất, ngắn gọn

---

QUY TẮC QUAN TRỌNG:

1. Nếu có đáp án đúng (có [ĐÚNG] hoặc có thể suy ra):
→ giải thích dựa trên đáp án đó

2. Nếu KHÔNG có đáp án đúng:
→ tự suy luận đáp án đúng dựa trên kiến thức hóa học THPT

3. KHÔNG được:
- bỏ trống explanation
- nói "không đủ dữ liệu"
- nói "không xác định được"

4. explanation phải:
- đúng kiến thức
- logic rõ ràng
- phù hợp học sinh THPT
- không dài dòng

5. tip phải:
- cực ngắn (1 câu)
- mang tính "mẹo làm bài" hoặc "nhận diện nhanh"

Format:
[
 { "tip": "...", "explanation": "..." }
]

DATA:
${JSON.stringify(items)}
`;

  const res = await openai.responses.create({
    model: MODEL,
    input: prompt,
  });

  const text = res.output_text.trim();

  try {
    return JSON.parse(text);
  } catch (e) {
    console.error("AI RAW:", text);
    throw new Error("Parse JSON fail");
  }
}

// ================= SQL =================
function buildSQL(rows) {
  const values = rows
    .map(
      (r) => `(
  '${r.question_id}'::uuid,
  ${escapeSql(r.tip)},
  ${escapeSql(r.explanation)}
)`
    )
    .join(",\n");

  return `UPDATE questions
SET tip = v.tip,
    explanation = v.explanation
FROM (
VALUES
${values}
) AS v(id, tip, explanation)
WHERE questions.id = v.id;
`;
}

// ================= MAIN =================
async function main() {
  console.log("Fetching...");
  const questions = await fetchQuestions(300);

  console.log("Found:", questions.length);
  if (!questions.length) return;

  const batches = chunk(questions, BATCH_SIZE);
  const sqlParts = [];

  for (let i = 0; i < batches.length; i++) {
    console.log("Batch", i + 1);

    const batch = batches[i];

    const ai = await genBatch(batch);

    // 🔥 SAFE MAP (không dùng ID từ AI)
    const safe = batch.map((q, idx) => ({
      question_id: q.question_id,
      tip: ai[idx]?.tip || "",
      explanation: ai[idx]?.explanation || "",
    }));

    sqlParts.push(buildSQL(safe));
  }

  fs.writeFileSync(
    path.resolve(process.cwd(), OUTPUT_SQL),
    sqlParts.join("\n\n")
  );

  console.log("DONE →", OUTPUT_SQL);
}

main().catch(console.error);
