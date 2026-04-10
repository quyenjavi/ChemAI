import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

function normCode(v: any) {
  return String(v ?? '').trim().replace(/\s+/g, '')
}

function normalizeText(v: any) {
  return String(v ?? '').trim()
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export async function POST(req: Request, { params }: { params: { examId: string } }) {
  const examId = params.examId
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const batch_id = normalizeText(body.batch_id)
  const onlySheetIds = Array.isArray(body.sheet_ids) ? body.sheet_ids.map((x: any) => String(x)).filter(Boolean) : null
  if (!batch_id && !(onlySheetIds && onlySheetIds.length)) {
    return NextResponse.json({ error: 'batch_id required' }, { status: 400 })
  }
  const svc = serviceRoleClient()

  const { data: teacher } = await svc.from('teacher_profiles').select('id, school_id').eq('user_id', user.id).maybeSingle()
  if (!teacher?.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const schoolId = teacher.school_id ? String(teacher.school_id) : null
  if (!schoolId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: exam } = await svc
    .from('official_exams')
    .select('id, school_id')
    .eq('id', examId)
    .maybeSingle()
  if (!exam || String(exam.school_id) !== schoolId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [studentsRes, papersRes] = await Promise.all([
    svc.from('official_exam_students').select('id, student_code').eq('official_exam_id', examId).limit(200000),
    svc.from('official_exam_papers').select('id, paper_code').eq('official_exam_id', examId).limit(5000)
  ])

  const studentByCode: Record<string, string> = {}
  for (const s of (studentsRes.data || []) as any[]) {
    const code = normCode(s.student_code)
    if (!code) continue
    studentByCode[code] = String(s.id)
  }

  const paperByCode: Record<string, string> = {}
  for (const p of (papersRes.data || []) as any[]) {
    const code = normCode(p.paper_code)
    if (!code) continue
    paperByCode[code] = String(p.id)
  }

  if (batch_id) {
    const { data: batchRow, error: batchErr } = await svc
      .from('official_exam_sheet_batches')
      .select('id, official_exam_id')
      .eq('id', batch_id)
      .maybeSingle()
    if (batchErr) return NextResponse.json({ error: batchErr.message }, { status: 500 })
    if (!batchRow?.id || String(batchRow.official_exam_id || '') !== String(examId)) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
    }
  }

  const sheetsQuery = svc
    .from('official_exam_sheets')
    .select('id, official_exam_id, batch_id, detected_student_code, detected_paper_code, final_student_code, final_paper_code, student_id, paper_id, match_status')
    .limit(200000)

  const { data: sheets, error: sheetsErr } = onlySheetIds?.length
    ? await sheetsQuery.in('id', onlySheetIds)
    : await sheetsQuery.eq('batch_id', batch_id)

  if (sheetsErr) return NextResponse.json({ error: sheetsErr.message }, { status: 500 })
  if (onlySheetIds?.length) {
    const sheetBatchIds = Array.from(new Set((sheets || []).map((s: any) => s.batch_id ? String(s.batch_id) : '').filter(Boolean)))
    if (!sheetBatchIds.length) return NextResponse.json({ error: 'Sheet missing batch_id' }, { status: 400 })
    const { data: batchRows, error: bErr } = await svc
      .from('official_exam_sheet_batches')
      .select('id, official_exam_id')
      .in('id', sheetBatchIds)
      .limit(5000)
    if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 })
    const examIdByBatchId: Record<string, string> = {}
    for (const r of (batchRows || []) as any[]) {
      if (r?.id) examIdByBatchId[String(r.id)] = String(r.official_exam_id || '')
    }
    for (const bid of sheetBatchIds) {
      if (String(examIdByBatchId[bid] || '') !== String(examId)) {
        return NextResponse.json({ error: 'Sheet not in this exam batch' }, { status: 400 })
      }
    }
  }

  const updates: any[] = []

  for (const sh of (sheets || []) as any[]) {
    const sc = normCode(sh.final_student_code || sh.detected_student_code || '')
    const pc = normCode(sh.final_paper_code || sh.detected_paper_code || '')

    const student_id = sc ? (studentByCode[sc] || null) : null
    const paper_id = pc ? (paperByCode[pc] || null) : null
    const match_status = student_id && paper_id ? 'matched' : student_id || paper_id ? 'partially_matched' : 'unmatched'

    const prevStudent = sh.student_id ? String(sh.student_id) : null
    const prevPaper = sh.paper_id ? String(sh.paper_id) : null
    const prevMatch = normalizeText(sh.match_status) || null
    const prevExamId = sh.official_exam_id ? String(sh.official_exam_id) : null

    if (prevStudent !== student_id || prevPaper !== paper_id || prevMatch !== match_status || prevExamId !== String(examId)) {
      updates.push({
        id: String(sh.id),
        official_exam_id: examId,
        student_id,
        paper_id,
        match_status
      })
    }
  }

  for (const ch of chunkArray(updates, 200)) {
    const { error } = await svc.from('official_exam_sheets').upsert(ch, { onConflict: 'id' } as any)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const [{ count: totalStudents }, { count: totalSheets }] = await Promise.all([
    svc.from('official_exam_students').select('id', { count: 'exact', head: true }).eq('official_exam_id', examId),
    svc.from('official_exam_sheets').select('id', { count: 'exact', head: true }).eq('official_exam_id', examId)
  ])

  await svc.from('official_exams').update({
    total_students: totalStudents || 0,
    total_sheets: totalSheets || 0
  } as any).eq('id', examId)

  let matchedStudentRows = 0
  let matchedPaperRows = 0
  let matchedBothRows = 0
  let unmatchedRows = 0
  const matchedStudentSet = new Set<string>()
  const matchedPaperSet = new Set<string>()

  for (const s of (sheets || []) as any[]) {
    const sc = normCode(s.final_student_code || s.detected_student_code || '')
    const pc = normCode(s.final_paper_code || s.detected_paper_code || '')
    const sid = sc ? studentByCode[sc] : null
    const pid = pc ? paperByCode[pc] : null
    if (sid) { matchedStudentRows += 1; matchedStudentSet.add(String(sid)) }
    if (pid) { matchedPaperRows += 1; matchedPaperSet.add(String(pid)) }
    if (sid && pid) matchedBothRows += 1
    else unmatchedRows += 1
  }

  const unmatchedSheets = (sheets || []).filter((s: any) => {
    const sc = normCode(s.final_student_code || s.detected_student_code || '')
    const pc = normCode(s.final_paper_code || s.detected_paper_code || '')
    const sid = sc ? studentByCode[sc] : null
    const pid = pc ? paperByCode[pc] : null
    return !(sid && pid)
  }).length

  return NextResponse.json({
    ok: true,
    sheets_updated: updates.length,
    counts: {
      total_students: totalStudents || 0,
      total_sheets: totalSheets || 0,
      batch_sheets: (sheets || []).length,
      matched_students: matchedStudentSet.size,
      matched_papers: matchedPaperSet.size,
      matched_rows: matchedBothRows,
      unmatched_count: unmatchedSheets,
      matched_student_rows: matchedStudentRows,
      matched_paper_rows: matchedPaperRows
    }
  })
}
