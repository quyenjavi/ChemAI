import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = 'nodejs'

function normalizeText(v: any) {
  return String(v ?? '').trim()
}

function toScore(v: any): number {
  if (v == null) return 0
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function formatScore(v: any): string {
  const n = toScore(v)
  const s = (Math.round(n * 1000) / 1000).toFixed(3)
  return s.replace(/\.000$/, '').replace(/(\.\d\d?)0$/, '$1')
}

function getOcrTotalScore(ocrJson: any): number {
  if (!ocrJson || typeof ocrJson !== 'object') return 0
  const legacy = toScore((ocrJson as any).score)
  if (legacy) return legacy
  const mcqScore = toScore((ocrJson as any)?.mcq?.mcq_score)
  const tfScore = toScore((ocrJson as any)?.true_false?.tf_score)
  const saScore = toScore((ocrJson as any)?.short_answer?.sa_score)
  return mcqScore + tfScore + saScore
}

export async function GET(req: Request, { params }: { params: { examId: string } }) {
  try {
    const examId = params.examId
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })

    const svc = serviceRoleClient()
    const { data: teacher } = await svc.from('teacher_profiles').select('id, school_id').eq('user_id', user.id).maybeSingle()
    if (!teacher?.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: { 'Cache-Control': 'no-store' } })
    const schoolId = teacher.school_id ? String(teacher.school_id) : null
    if (!schoolId) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: { 'Cache-Control': 'no-store' } })

    const { data: exam } = await svc.from('official_exams').select('id, title, school_id').eq('id', examId).maybeSingle()
    if (!exam || String(exam.school_id) !== schoolId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
    }

    const fetchStudents = async (select: string) => {
      return svc
        .from('official_exam_students')
        .select(select)
        .eq('official_exam_id', examId)
        .limit(200000)
    }

    const resStudentsA = await fetchStudents('id, student_code, full_name, class_name, birth_date_text, birth_date, gender, room_no')
    let students = resStudentsA.data as any[] | null
    let stuErr = resStudentsA.error as any
    if (stuErr && String(stuErr.message || '').includes('birth_date_text')) {
      const resStudentsB = await fetchStudents('id, student_code, full_name, class_name, birth_date, gender, room_no')
      students = resStudentsB.data as any[] | null
      stuErr = resStudentsB.error as any
    }
    if (stuErr) return NextResponse.json({ error: stuErr.message }, { status: 500, headers: { 'Cache-Control': 'no-store' } })

    const { data: sheets, error: shErr } = await svc
      .from('official_exam_sheets')
      .select('id, student_id, reviewed_at, ocr_json, essay_score')
      .eq('official_exam_id', examId)
      .not('student_id', 'is', null)
      .limit(200000)
    if (shErr) return NextResponse.json({ error: shErr.message }, { status: 500, headers: { 'Cache-Control': 'no-store' } })

    const bestSheetByStudent: Record<string, any> = {}
    for (const sh of (sheets || []) as any[]) {
      const sid = sh.student_id ? String(sh.student_id) : ''
      if (!sid) continue
      const mcqScore = getOcrTotalScore((sh as any).ocr_json)
      const cur = bestSheetByStudent[sid]
      if (!cur) {
        bestSheetByStudent[sid] = { ...sh, __mcqScore: mcqScore }
        continue
      }
      const curScore = toScore((cur as any).__mcqScore)
      const choose = mcqScore > curScore || (mcqScore === curScore && String(sh.reviewed_at || '') > String(cur.reviewed_at || ''))
      if (choose) bestSheetByStudent[sid] = { ...sh, __mcqScore: mcqScore }
    }

    const rows = (students || []).map((s: any) => {
      const sid = String(s.id)
      const sh = bestSheetByStudent[sid] || null
      const roomNo = normalizeText(s.room_no)
      const studentCode = normalizeText(s.student_code)
      const essayScore = toScore(sh?.essay_score)
      const mcqScore = sh ? (toScore((sh as any).__mcqScore) || getOcrTotalScore(sh?.ocr_json)) : 0
      const total = essayScore + mcqScore
      return {
        room_no: roomNo,
        student_code: studentCode,
        full_name: normalizeText(s.full_name),
        class_name: normalizeText(s.class_name),
        gender: normalizeText(s.gender),
        birth_date: normalizeText((s as any).birth_date_text) || (s.birth_date ? String(s.birth_date) : ''),
        essay_score: essayScore,
        mcq_score: mcqScore,
        total_score: total
      }
    })

    rows.sort((a, b) => {
      const c1 = (a.room_no || '').localeCompare((b.room_no || ''), 'vi')
      if (c1 !== 0) return c1
      const c2 = (a.class_name || '').localeCompare((b.class_name || ''), 'vi')
      if (c2 !== 0) return c2
      return (a.student_code || '').localeCompare((b.student_code || ''), 'vi')
    })

  const header = [
    'STT',
    'Phòng thi',
    'SBD',
    'Họ và tên',
    'Lớp',
    'Giới tính',
    'Ngày sinh',
    'Điểm tự luận',
    'Điểm trắc nghiệm',
    'Tổng điểm'
  ]

    const safe = normalizeText(exam.title || 'official-exam')
      .replace(/[^a-zA-Z0-9\s_-]+/g, '')
      .trim()
      .replace(/\s+/g, '_')
    const filename = `${safe || 'official-exam'}.xlsx`

    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Bang diem', { views: [{ state: 'frozen', ySplit: 1 }] })
    sheet.addRow(header)
    sheet.getRow(1).font = { bold: true }
    sheet.columns = [
      { width: 6 },
      { width: 10 },
      { width: 12 },
      { width: 26 },
      { width: 10 },
      { width: 10 },
      { width: 14 },
      { width: 14 },
      { width: 14 },
      { width: 12 },
    ]

    for (let i = 0; i < rows.length; i += 1) {
      const r = rows[i]
      sheet.addRow([
        i + 1,
        r.room_no,
        r.student_code,
        r.full_name,
        r.class_name,
        r.gender,
        r.birth_date,
        Number(formatScore(r.essay_score)),
        Number(formatScore(r.mcq_score)),
        Number(formatScore(r.total_score))
      ])
    }

    for (const colIdx of [8, 9, 10]) {
      sheet.getColumn(colIdx).numFmt = '0.###'
    }

    const buf = await workbook.xlsx.writeBuffer()
    return new NextResponse(buf as any, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    })
  } catch (e: any) {
    console.error('export-scores error:', e)
    return NextResponse.json(
      { error: e?.message || 'Server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
