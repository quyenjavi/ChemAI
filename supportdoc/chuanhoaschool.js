require("dotenv").config({ path: ".env" });

const readline = require("readline");
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
const MAX_CANDIDATES = 12;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(q) {
  return new Promise((resolve) => rl.question(q, (ans) => resolve(ans.trim())));
}

function normalize(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanSchoolName(name) {
  return String(name || "").replace(/^trường\s+/i, "").trim();
}

function titleCase(str) {
  return String(str || "")
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function buildSchoolCode(name, cityName) {
  const cityPart = normalize(cityName).replace(/\s+/g, "_").toUpperCase();
  const schoolPart = normalize(name).replace(/\s+/g, "_").toUpperCase();
  return `${cityPart}__${schoolPart}`.slice(0, 120);
}

function inferSchoolType(name) {
  const n = normalize(name);
  if (n.includes("lien cap")) return "lien_cap";
  if (n.includes("thcs") && n.includes("thpt")) return "thcs_thpt";
  if (n.includes("thpt")) return "thpt";
  if (n.includes("thcs")) return "thcs";
  if (n.includes("tieu hoc")) return "tieu_hoc";
  return "khac";
}

function inferOwnershipType(name) {
  const n = normalize(name);
  if (
    n.includes("tu thuc") ||
    n.includes("dan lap") ||
    n.includes("quoc te") ||
    n.includes("private")
  ) {
    return "private";
  }
  return "public";
}

function extractJson(text) {
  const trimmed = String(text || "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object in AI output");
  }
  return JSON.parse(trimmed.slice(start, end + 1));
}

async function getPending() {
  const { data, error } = await supabase
    .from("pending_school_matches")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function getCitiesMap() {
  const { data, error } = await supabase.from("cities").select("id, name");
  if (error) throw error;
  return new Map((data || []).map((x) => [x.id, x.name]));
}

async function getAllSchools() {
  const { data, error } = await supabase
    .from("schools")
    .select("id, name, normalized_name, city_id, status, merged_into_school_id")
    .neq("status", "merged");

  if (error) throw error;
  return data || [];
}

async function findSchoolByExactName(name, cityId = null) {
  let query = supabase
    .from("schools")
    .select("id, name, normalized_name, city_id, status")
    .eq("name", name)
    .neq("status", "merged")
    .limit(5);

  if (cityId) query = query.eq("city_id", cityId);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function updatePending(rowId, payload) {
  const { error } = await supabase
    .from("pending_school_matches")
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .eq("id", rowId);

  if (error) throw error;
}

async function updateSchoolName(schoolId, cityName, newName) {
  const cleaned = titleCase(cleanSchoolName(newName));

  const { error } = await supabase
    .from("schools")
    .update({
      name: cleaned,
      normalized_name: normalize(cleaned),
      code: buildSchoolCode(cleaned, cityName),
      school_type: inferSchoolType(cleaned),
      ownership_type: inferOwnershipType(cleaned),
      is_active: true,
      status: "active",
      merged_into_school_id: null,
    })
    .eq("id", schoolId);

  if (error) throw error;
}

async function mergeSchool(fromId, toId) {
  console.log(`\n⚡ MERGE ${fromId} -> ${toId}`);

  const { data: classes, error: classesError } = await supabase
    .from("classes")
    .select("*")
    .eq("school_id", fromId);

  if (classesError) throw classesError;

  for (const c of classes || []) {
    const { data: exist, error: existError } = await supabase
      .from("classes")
      .select("id")
      .eq("school_id", toId)
      .eq("name", c.name)
      .eq("academic_year_id", c.academic_year_id)
      .eq("grade_id", c.grade_id)
      .limit(1);

    if (existError) throw existError;

    if (exist && exist.length) {
      const targetClass = exist[0].id;

      let { error } = await supabase
        .from("student_profiles")
        .update({ class_id: targetClass, school_id: toId })
        .eq("class_id", c.id);
      if (error) throw error;

      ({ error } = await supabase
        .from("teacher_class_assignments")
        .update({ class_id: targetClass })
        .eq("class_id", c.id));
      if (error) throw error;

      ({ error } = await supabase.from("classes").delete().eq("id", c.id));
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("classes")
        .update({ school_id: toId })
        .eq("id", c.id);
      if (error) throw error;
    }
  }

  let { error } = await supabase
    .from("student_profiles")
    .update({ school_id: toId })
    .eq("school_id", fromId);
  if (error) throw error;

  ({ error } = await supabase
    .from("teacher_profiles")
    .update({ school_id: toId })
    .eq("school_id", fromId));
  if (error) throw error;

  ({ error } = await supabase
    .from("schools")
    .update({
      status: "merged",
      is_active: false,
      merged_into_school_id: toId,
    })
    .eq("id", fromId));
  if (error) throw error;

  console.log("✅ MERGED");
}

async function askAIForCandidates(inputName, cityName, schools, cityMap) {
  const candidates = schools.map((s) => ({
    id: s.id,
    name: s.name,
    city_name: cityMap.get(s.city_id) || "Unknown",
    status: s.status,
  }));

  const prompt = `
Bạn là hệ thống gợi ý trường học Việt Nam.

Nhiệm vụ:
Từ input tên trường do học sinh nhập và thành phố hiện tại, hãy chọn ra tối đa 8 candidate liên quan nhất trong danh sách schools hiện có.

Yêu cầu rất quan trọng:
- Ưu tiên các candidate thực sự liên quan về tên.
- Nếu input là "Trường THPT Đỗ Đăng Tuyển", candidate đầu tiên phải là trường gần nhất với "Đỗ Đăng Tuyển", không được đẩy các trường THPT bất kỳ cùng thành phố lên cao chỉ vì cùng có chữ THPT.
- Có thể dùng cả tên trường và city_name để suy luận.
- Không bịa id. Chỉ dùng id có trong danh sách.
- Nếu candidate không liên quan thì đừng đưa vào.
- Trả về JSON:
{
  "candidate_ids": ["id1","id2","id3"],
  "reason": "..."
}

INPUT:
${JSON.stringify(
  {
    raw_input_name: inputName,
    city_name: cityName,
    schools: candidates,
  },
  null,
  2
)}
`;

  const response = await openai.responses.create({
    model: MODEL,
    input: prompt,
  });

  const parsed = extractJson(response.output_text || "");
  const ids = Array.isArray(parsed.candidate_ids) ? parsed.candidate_ids : [];

  const ranked = ids
    .map((id) => schools.find((s) => s.id === id))
    .filter(Boolean)
    .slice(0, 8)
    .map((s) => ({
      ...s,
      city_name: cityMap.get(s.city_id) || "Unknown",
    }));

  return ranked;
}

async function main() {
  const pending = await getPending();
  const cityMap = await getCitiesMap();
  const schools = await getAllSchools();

  if (!pending.length) {
    console.log("No pending");
    rl.close();
    return;
  }

  for (const row of pending) {
    const pendingCityName = cityMap.get(row.city_id) || "Unknown city";

    const candidatePool = schools.filter((s) => s.id !== row.temporary_school_id);

    const ranked = await askAIForCandidates(
      row.raw_input_name,
      pendingCityName,
      candidatePool,
      cityMap
    );

    console.log("\n====================================================");
    console.log(`INPUT: ${row.raw_input_name}`);
    console.log(`CITY : ${pendingCityName}`);
    console.log(`PENDING ID: ${row.id}`);
    console.log(`TEMP SCHOOL ID: ${row.temporary_school_id}`);

    console.log("\nGỢI Ý TÌM ĐƯỢC:");
    ranked.forEach((s, i) => {
      console.log(`${i + 1}. ${s.name} — ${s.city_name} | id=${s.id}`);
    });

    console.log("\n0. Nhập tên trường tôi muốn");
    console.log("s. Bỏ qua record này");

    const choice = await ask("\nChọn phương án: ");

    if (choice.toLowerCase() === "s") {
      console.log("⏭ SKIPPED");
      continue;
    }

    let finalSchoolId = row.temporary_school_id;
    let finalSchoolName = row.raw_input_name;
    let selectedExisting = null;

    if (choice === "0") {
      const manualName = await ask("Nhập tên trường bạn muốn lưu: ");
      if (!manualName) {
        console.log("❌ Tên trống, bỏ qua.");
        continue;
      }

      const cleanedManualName = titleCase(cleanSchoolName(manualName));
      const exactExisting = await findSchoolByExactName(cleanedManualName);

      if (exactExisting.length) {
        console.log("\nTên này đã tồn tại trong DB:");
        exactExisting.forEach((s, i) => {
          console.log(
            `${i + 1}. ${s.name} — ${cityMap.get(s.city_id) || "Unknown"} | id=${s.id}`
          );
        });

        const mergeAns = await ask(
          "Tên đã tồn tại. Merge TEMP school vào một school ở trên? (y/n): "
        );

        if (mergeAns.toLowerCase() === "y") {
          const idx = await ask("Chọn số trường đích: ");
          const target = exactExisting[Number(idx) - 1];

          if (!target) {
            console.log("❌ Lựa chọn không hợp lệ, bỏ qua record.");
            continue;
          }

          await mergeSchool(row.temporary_school_id, target.id);
          finalSchoolId = target.id;
          finalSchoolName = target.name;
          selectedExisting = target;
        } else {
          console.log("⏭ Không merge, bỏ qua record để xử lý sau.");
          continue;
        }
      } else {
        await updateSchoolName(row.temporary_school_id, pendingCityName, cleanedManualName);
        finalSchoolId = row.temporary_school_id;
        finalSchoolName = cleanedManualName;
        console.log(`✅ Updated temp school -> ${cleanedManualName}`);
      }
    } else {
      const picked = ranked[Number(choice) - 1];
      if (!picked) {
        console.log("❌ Lựa chọn không hợp lệ, bỏ qua.");
        continue;
      }

      selectedExisting = picked;
      console.log(`\nBạn chọn: ${picked.name} — ${picked.city_name} | id=${picked.id}`);

      const mergeAns = await ask(
        `Merge TEMP school (${row.temporary_school_id}) vào school này? (y/n): `
      );

      if (mergeAns.toLowerCase() === "y") {
        await mergeSchool(row.temporary_school_id, picked.id);
        finalSchoolId = picked.id;
        finalSchoolName = picked.name;
      } else {
        const manualName = await ask(
          "Không merge. Nhập tên trường muốn giữ cho TEMP school (Enter để dùng input hiện tại): "
        );

        const chosenName = manualName || row.raw_input_name;
        const cleanedChosenName = titleCase(cleanSchoolName(chosenName));

        const exactExisting = await findSchoolByExactName(cleanedChosenName);

        if (exactExisting.length) {
          console.log("\nTên này đã tồn tại trong DB:");
          exactExisting.forEach((s, i) => {
            console.log(
              `${i + 1}. ${s.name} — ${cityMap.get(s.city_id) || "Unknown"} | id=${s.id}`
            );
          });

          const secondMerge = await ask("Merge vào một school ở trên? (y/n): ");
          if (secondMerge.toLowerCase() === "y") {
            const idx = await ask("Chọn số trường đích: ");
            const target = exactExisting[Number(idx) - 1];

            if (!target) {
              console.log("❌ Lựa chọn không hợp lệ, bỏ qua.");
              continue;
            }

            await mergeSchool(row.temporary_school_id, target.id);
            finalSchoolId = target.id;
            finalSchoolName = target.name;
            selectedExisting = target;
          } else {
            console.log("⏭ Không merge, bỏ qua record để xử lý sau.");
            continue;
          }
        } else {
          await updateSchoolName(row.temporary_school_id, pendingCityName, cleanedChosenName);
          finalSchoolId = row.temporary_school_id;
          finalSchoolName = cleanedChosenName;
        }
      }
    }

    await updatePending(row.id, {
      status: "matched",
      suggested_school_id: selectedExisting ? selectedExisting.id : finalSchoolId,
      resolved_school_id: finalSchoolId,
      confidence_score: selectedExisting ? 1 : 1,
      review_note: selectedExisting
        ? `Manual confirmed. Final school: ${finalSchoolName}`
        : `Manual name set: ${finalSchoolName}`,
    });

    console.log("✔ DONE");
  }

  rl.close();
}

main().catch((err) => {
  console.error("FATAL:", err);
  rl.close();
  process.exit(1);
});