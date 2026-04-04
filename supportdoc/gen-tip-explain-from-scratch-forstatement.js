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

// Model rẻ
const MODEL = "gpt-4o-mini";

// Batch nhỏ để giảm lỗi thiếu item
const BATCH_SIZE = 8;

// Số statement tối đa mỗi lần chạy
const FETCH_LIMIT = 300;

// Retry cho item thiếu
const MAX_RETRY_MISSING = 1;

// File SQL output
const OUTPUT_SQL = "update_question_statements_tip_explain.sql";

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

async function fetchTargetStatements(limit = FETCH_LIMIT) {
  const { data: statements, error } = await supabase
    .from("question_statements")
    .select(`
      id,
      question_id,
      statement_key,
      statement_text,
      correct_answer,
      explanation,
      tip,
      sort_order,
      created_at
    `)
    .or("tip.is.null,explanation.is.null")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  if (!statements || statements.length === 0) return [];

  const questionIds = [...new Set(statements.map((s) => s.question_id).filter(Boolean))];

  const { data: questions, error: qError } = await supabase
    .from("questions")
    .select(`
      id,
      content,
      brief_content,
      question_type,
      topic
    `)
    .in("id", questionIds);

  if (qError) throw qError;

  const questionMap = new Map((questions || []).map((q) => [q.id, q]));

  return statements.map((s) => {
    const parent = questionMap.get(s.question_id) || {};
    return {
      statement_id: s.id,
      question_id: s.question_id,
      statement_key: s.statement_key,
      statement_text: s.statement_text || "",
      correct_answer: s.correct_answer,
      sort_order: s.sort_order,
      question_content: parent.content || "",
      brief_content: parent.brief_content || "",
      question_type: parent.question_type || "",
      topic: parent.topic || "",
    };
  });
}

function buildPrompt(items) {
  return `
Bạn là giáo viên Hóa học THPT.

Nhiệm vụ:
Với mỗi statement đúng/sai, hãy tạo:
1. tip: cực ngắn, 1 câu, giúp học sinh nhận ra mấu chốt.
2. explanation: ngắn gọn, rõ ràng, đúng bản chất, giải thích vì sao statement đúng hoặc sai.

Yêu cầu:
- Viết tiếng Việt.
- Ngắn gọn, dễ hiểu cho học sinh THPT.
- Không lan man.
- Không bỏ sót bất kỳ statement nào.
- PHẢI giữ nguyên statement_id của từng phần tử input khi trả kết quả.
- Nếu statement sai, nói rõ sai ở đâu và nêu ý đúng.
- Nếu statement đúng, giải thích ngắn gọn vì sao đúng.
- Mỗi tip tối đa khoảng 20 từ.
- Mỗi explanation tối đa khoảng 60 từ.
- Không dùng markdown.
- Chỉ trả về JSON array.
- Phải trả đủ đúng số lượng phần tử input.

Format bắt buộc:
[
  {
    "statement_id": "...",
    "tip": "...",
    "explanation": "..."
  }
]

Dữ liệu:
${JSON.stringify(items, null, 2)}
`;
}

function fallbackTip(item) {
  if ((item.correct_answer || "").toString().toLowerCase() === "true") {
    return "Dựa vào kiến thức trọng tâm để xác nhận nhận định đúng.";
  }
  return "Xác định chỗ sai trong nhận định rồi đối chiếu kiến thức.";
}

function fallbackExplanation(item) {
  const isTrue = (item.correct_answer || "").toString().toLowerCase() === "true";
  if (isTrue) {
    return "Nhận định này đúng khi đối chiếu với kiến thức trọng tâm của bài học.";
  }
  return "Nhận định này sai; cần đối chiếu lại kiến thức trọng tâm để xác định ý đúng.";
}

async function callModel(batch) {
  const prompt = buildPrompt(batch);

  const response = await openai.responses.create({
    model: MODEL,
    input: prompt,
  });

  return response.output_text?.trim() || "";
}

async function generateBatch(batch, retryCount = MAX_RETRY_MISSING) {
  const text = await callModel(batch);

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    console.error("=== RAW AI RESPONSE START ===");
    console.error(text);
    console.error("=== RAW AI RESPONSE END ===");
    throw new Error("AI response is not valid JSON");
  }

  if (!Array.isArray(parsed)) {
    console.error("=== RAW AI RESPONSE START ===");
    console.error(text);
    console.error("=== RAW AI RESPONSE END ===");
    throw new Error("AI response is not an array");
  }

  const byId = new Map();

  for (const item of parsed) {
    if (!item || !item.statement_id) continue;

    byId.set(item.statement_id, {
      statement_id: item.statement_id,
      tip: typeof item.tip === "string" ? item.tip.trim() : "",
      explanation:
        typeof item.explanation === "string" ? item.explanation.trim() : "",
    });
  }

  const missing = batch.filter((x) => !byId.has(x.statement_id));

  if (missing.length > 0) {
    console.warn(
      `Warning: missing ${missing.length}/${batch.length} statements in this batch.`
    );
    console.warn(
      "Missing IDs:",
      missing.map((x) => x.statement_id)
    );

    if (retryCount > 0) {
      console.warn(`Retrying ${missing.length} missing statements...`);
      const retried = await generateBatch(missing, retryCount - 1);

      for (const item of retried) {
        byId.set(item.statement_id, item);
      }
    }
  }

  return batch.map((item) => {
    const found = byId.get(item.statement_id);

    return {
      statement_id: item.statement_id,
      tip: found?.tip || fallbackTip(item),
      explanation: found?.explanation || fallbackExplanation(item),
    };
  });
}

function buildUpdateSql(rows) {
  const values = rows
    .map(
      (r) => `(
  '${r.id}'::uuid,
  ${escapeSql(r.tip)},
  ${escapeSql(r.explanation)}
)`
    )
    .join(",\n");

  return `UPDATE question_statements AS qs
SET
  tip = v.tip,
  explanation = v.explanation
FROM (
VALUES
${values}
) AS v(id, tip, explanation)
WHERE qs.id = v.id;`;
}

async function main() {
  console.log("Fetching statements needing tip/explanation...");
  const statements = await fetchTargetStatements();

  console.log(`Found ${statements.length} statements.`);
  if (!statements.length) {
    console.log("No statements need update.");
    return;
  }

  const batches = chunkArray(statements, BATCH_SIZE);
  const sqlBlocks = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`Processing batch ${i + 1}/${batches.length}...`);

    const generated = await generateBatch(batch);

    const rows = generated.map((item) => ({
      id: item.statement_id,
      tip: item.tip,
      explanation: item.explanation,
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