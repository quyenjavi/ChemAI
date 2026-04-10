import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

function normalizeText(v: any) {
  return String(v ?? '').trim()
}

export async function POST(req: Request, { params }: { params: { examId: string, sheetId: string } }) {
  const examId = params.examId
  const sheetId = params.sheetId
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const final_student_code = body.final_student_code == null ? null : normalizeText(body.final_student_code) || null
  const final_paper_code = body.final_paper_code == null ? null : normalizeText(body.final_paper_code) || null
  const review_note = body.review_note == null ? null : normalizeText(body.review_note) || null

  const svc = serviceRoleClient()
  const { data: teacher } = await svc.from('teacher_profiles').select('id, school_id').eq('user_id', user.id).maybeSingle()
  if (!teacher?.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const schoolId = teacher.school_id ? String(teacher.school_id) : null
  if (!schoolId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: exam } = await svc.from('official_exams').select('id, school_id').eq('id', examId).maybeSingle()
  if (!exam || String(exam.school_id) !== schoolId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await svc
    .from('official_exam_sheets')
    .update({
      final_student_code,
      final_paper_code,
      review_note,
      reviewed_at: new Date().toISOString()
    } as any)
    .eq('id', sheetId)
    .eq('official_exam_id', examId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
