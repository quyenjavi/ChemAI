import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

function normCode(v: any) {
  return String(v ?? '').trim().replace(/\s+/g, '')
}

export async function GET(req: Request, { params }: { params: { examId: string } }) {
  const examId = params.examId
  const url = new URL(req.url)
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') || 200)))
  const batchId = String(url.searchParams.get('batch_id') || '').trim()
  if (!batchId) return NextResponse.json({ error: 'batch_id required' }, { status: 400 })

  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = serviceRoleClient()
  const { data: teacher } = await svc.from('teacher_profiles').select('id, school_id').eq('user_id', user.id).maybeSingle()
  if (!teacher?.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const schoolId = teacher.school_id ? String(teacher.school_id) : null
  if (!schoolId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: exam } = await svc.from('official_exams').select('id, school_id').eq('id', examId).maybeSingle()
  if (!exam || String(exam.school_id) !== schoolId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: sheets, error } = await svc
    .from('official_exam_sheets')
    .select('id, detected_student_code, detected_paper_code, final_student_code, final_paper_code, student_id, paper_id, match_status, process_status, review_note, reviewed_at')
    .eq('official_exam_id', examId)
    .eq('batch_id', batchId)
    .order('reviewed_at', { ascending: true, nullsFirst: true } as any)
    .limit(200000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const dupCountByStudentCode: Record<string, number> = {}
  for (const s of (sheets || []) as any[]) {
    const code = normCode(s.final_student_code || s.detected_student_code || '')
    if (!code) continue
    dupCountByStudentCode[code] = (dupCountByStudentCode[code] || 0) + 1
  }

  const rows = (sheets || []).map((s: any) => {
    const usedStudentCode = normCode(s.final_student_code || s.detected_student_code || '')
    const dupCount = usedStudentCode ? (dupCountByStudentCode[usedStudentCode] || 0) : 0
    const item = {
      id: String(s.id),
      detected_student_code: s.detected_student_code || null,
      detected_paper_code: s.detected_paper_code || null,
      final_student_code: s.final_student_code || null,
      final_paper_code: s.final_paper_code || null,
      student_id: s.student_id ? String(s.student_id) : null,
      paper_id: s.paper_id ? String(s.paper_id) : null,
      match_status: s.match_status || null,
      process_status: s.process_status || null,
      review_note: s.review_note || null,
      reviewed_at: s.reviewed_at || null,
      flags: {
        missing_student_id: !s.student_id,
        missing_paper_id: !s.paper_id,
        detected_student_code_empty: !normCode(s.detected_student_code || ''),
        detected_paper_code_empty: !normCode(s.detected_paper_code || ''),
        duplicate_student_code: dupCount > 1
      },
      duplicate_count_for_student_code: dupCount
    }
    return item
  })

  const filtered = rows.filter((r: any) => {
    const f = r.flags || {}
    return f.missing_student_id || f.missing_paper_id || f.detected_student_code_empty || f.detected_paper_code_empty || f.duplicate_student_code
  })

  return NextResponse.json({ items: filtered.slice(0, limit), total: filtered.length })
}
