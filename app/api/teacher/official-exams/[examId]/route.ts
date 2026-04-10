import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

function normalizeText(v: any) {
  return String(v ?? '').trim()
}

export async function GET(_req: Request, { params }: { params: { examId: string } }) {
  const examId = params.examId
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = serviceRoleClient()
  const { data: teacher } = await svc.from('teacher_profiles').select('id, school_id').eq('user_id', user.id).maybeSingle()
  if (!teacher?.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const schoolId = teacher.school_id ? String(teacher.school_id) : null
  if (!schoolId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: exam, error: examErr } = await svc
    .from('official_exams')
    .select('id, title, school_id, grade_id, exam_date, status, lesson_id, total_students, total_sheets, published_at')
    .eq('id', examId)
    .maybeSingle()
  if (examErr) return NextResponse.json({ error: examErr.message }, { status: 500 })
  if (!exam || String(exam.school_id) !== schoolId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [papersCountRes, studentsCountRes, sheetsCountRes] = await Promise.all([
    svc.from('official_exam_papers').select('id', { count: 'exact', head: true }).eq('official_exam_id', examId),
    svc.from('official_exam_students').select('id', { count: 'exact', head: true }).eq('official_exam_id', examId),
    svc.from('official_exam_sheets').select('id', { count: 'exact', head: true }).eq('official_exam_id', examId)
  ])

  return NextResponse.json({
    exam: {
      id: String(exam.id),
      title: normalizeText(exam.title),
      school_id: exam.school_id ? String(exam.school_id) : null,
      grade_id: exam.grade_id ? String(exam.grade_id) : null,
      exam_date: exam.exam_date || null,
      status: normalizeText(exam.status) || 'draft',
      lesson_id: exam.lesson_id ? String(exam.lesson_id) : null,
      total_students: Number(exam.total_students) || 0,
      total_sheets: Number(exam.total_sheets) || 0,
      published_at: exam.published_at || null
    },
    counts: {
      papers: papersCountRes.count || 0,
      students: studentsCountRes.count || 0,
      sheets: sheetsCountRes.count || 0
    }
  })
}
