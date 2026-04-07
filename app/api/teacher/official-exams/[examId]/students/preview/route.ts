import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'

function normKey(v: any) {
  return String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function normText(v: any) {
  return String(v ?? '').trim()
}

const CODE_KEYS = ['student_code', 'exam_code', 'sbd', 'số báo danh', 'so bao danh', 'ma hoc sinh', 'mã học sinh', 'ma thi sinh', 'mã thí sinh']
const NAME_KEYS = ['full_name', 'ho ten', 'họ tên', 'ten', 'tên', 'name']
const CLASS_KEYS = ['class_name', 'class', 'lop', 'lớp']
const GENDER_KEYS = ['gender', 'gioi tinh', 'giới tính', 'sex']
const BIRTH_KEYS = ['birth_date', 'ngay sinh', 'ngày sinh', 'dob', 'date of birth']
const NOTE_KEYS = ['note', 'ghi chu', 'ghi chú', 'remark']

function findHeader(headers: string[], candidates: string[]) {
  for (const c of candidates) {
    const idx = headers.indexOf(c)
    if (idx >= 0) return idx
  }
  return -1
}

export async function POST(req: Request, { params }: { params: { examId: string } }) {
  const examId = params.examId
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = serviceRoleClient()
  const { data: teacher } = await svc.from('teacher_profiles').select('id').eq('user_id', user.id).maybeSingle()
  if (!teacher?.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: exam } = await svc.from('official_exams').select('id, teacher_id').eq('id', examId).maybeSingle()
  if (!exam || String(exam.teacher_id) !== String(teacher.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Thiếu file Excel' }, { status: 400 })

  const buf = Buffer.from(await file.arrayBuffer())
  const wb = XLSX.read(buf, { type: 'buffer' })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) return NextResponse.json({ error: 'File Excel không có sheet' }, { status: 400 })
  const ws = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' })
  if (!rows.length) return NextResponse.json({ error: 'File Excel trống' }, { status: 400 })

  const headers = Object.keys(rows[0] || {}).map((h) => normKey(h))
  const headerMap: Record<string, string> = {}
  for (const k of Object.keys(rows[0] || {})) headerMap[normKey(k)] = k

  const codeKey = findHeader(headers, CODE_KEYS)
  const nameKey = findHeader(headers, NAME_KEYS)
  const classKey = findHeader(headers, CLASS_KEYS)
  const genderKey = findHeader(headers, GENDER_KEYS)
  const birthKey = findHeader(headers, BIRTH_KEYS)
  const noteKey = findHeader(headers, NOTE_KEYS)

  if (codeKey < 0) return NextResponse.json({ error: 'Không tìm thấy cột student_code / exam_code / SBD' }, { status: 400 })
  if (nameKey < 0) return NextResponse.json({ error: 'Không tìm thấy cột họ tên' }, { status: 400 })
  if (classKey < 0) return NextResponse.json({ error: 'Không tìm thấy cột lớp' }, { status: 400 })

  const codeHeader = headerMap[headers[codeKey]]
  const nameHeader = headerMap[headers[nameKey]]
  const classHeader = headerMap[headers[classKey]]
  const genderHeader = genderKey >= 0 ? headerMap[headers[genderKey]] : null
  const birthHeader = birthKey >= 0 ? headerMap[headers[birthKey]] : null
  const noteHeader = noteKey >= 0 ? headerMap[headers[noteKey]] : null

  const items = rows.map((r: Record<string, any>) => {
    const student_code = normText(r[codeHeader])
    const full_name = normText(r[nameHeader])
    const class_name = normText(r[classHeader])
    const gender = genderHeader ? normText(r[genderHeader]) : ''
    const birth_date = birthHeader ? normText(r[birthHeader]) : ''
    const note = noteHeader ? normText(r[noteHeader]) : ''
    return { student_code, full_name, class_name, gender, birth_date, note }
  }).filter((x: { student_code: string, full_name: string, class_name: string }) => x.student_code || x.full_name || x.class_name)

  const seen: Record<string, number> = {}
  const duplicatesInFile: string[] = []
  for (const it of items) {
    const code = normText(it.student_code)
    if (!code) continue
    seen[code] = (seen[code] || 0) + 1
  }
  for (const [code, cnt] of Object.entries(seen)) {
    if (cnt > 1) duplicatesInFile.push(code)
  }

  return NextResponse.json({
    items,
    duplicates_in_file: duplicatesInFile,
    mapping: { student_code: codeHeader, full_name: nameHeader, class_name: classHeader }
  })
}
