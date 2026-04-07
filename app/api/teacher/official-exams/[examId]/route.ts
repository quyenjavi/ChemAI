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
  const { data: teacher } = await svc.from('teacher_profiles').select('id').eq('user_id', user.id).maybeSingle()
  if (!teacher?.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: exam, error: examErr } = await svc
    .from('official_exams')
    .select('id, teacher_id, exam_title, grade_id, subject_name, exam_date, status, description, metadata, created_at')
    .eq('id', examId)
    .maybeSingle()
  if (examErr) return NextResponse.json({ error: examErr.message }, { status: 500 })
  if (!exam || String(exam.teacher_id) !== String(teacher.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [gradesRes, papersRes, studentsRes, sheetsRes, attemptsRes] = await Promise.all([
    svc.from('grades').select('id,name').eq('id', exam.grade_id).maybeSingle(),
    svc.from('official_exam_papers').select('id, paper_code, process_status, metadata').eq('official_exam_id', examId).order('paper_code', { ascending: true }).limit(200),
    svc.from('official_exam_students').select('id', { count: 'exact', head: true }).eq('official_exam_id', examId),
    svc.from('official_exam_sheets').select('id', { count: 'exact', head: true }).eq('official_exam_id', examId),
    svc.from('official_exam_attempts').select('id, grading_status').eq('official_exam_id', examId).limit(200000)
  ])

  const lessonIds = Array.from(new Set((papersRes.data || []).map((p: any) => String(p?.metadata?.lesson_id || '')).filter(Boolean)))
  const lessonById: Record<string, any> = {}
  if (lessonIds.length) {
    const { data: lessons } = await svc
      .from('lessons')
      .select('id, title, grade_id')
      .in('id', lessonIds)
      .limit(1000)
    for (const l of (lessons || []) as any[]) lessonById[String(l.id)] = l
  }

  const questionCountByLessonId: Record<string, number> = {}
  if (lessonIds.length) {
    const { data: qs } = await svc
      .from('questions')
      .select('id, lesson_id')
      .in('lesson_id', lessonIds)
      .limit(200000)
    for (const q of (qs || []) as any[]) {
      const lid = String(q.lesson_id || '')
      if (!lid) continue
      questionCountByLessonId[lid] = (questionCountByLessonId[lid] || 0) + 1
    }
  }

  let gradedCount = 0
  for (const a of (attemptsRes.data || []) as any[]) {
    if (normalizeText(a.grading_status) === 'graded') gradedCount += 1
  }

  const papers = (papersRes.data || []).map((p: any) => {
    const lessonId = p?.metadata?.lesson_id ? String(p.metadata.lesson_id) : null
    const lesson = lessonId ? lessonById[lessonId] : null
    return {
      id: String(p.id),
      paper_code: normalizeText(p.paper_code),
      process_status: normalizeText(p.process_status) || 'uploaded',
      lesson_id: lessonId,
      lesson_title: lesson?.title ? normalizeText(lesson.title) : null,
      lesson_question_count: lessonId ? (questionCountByLessonId[lessonId] || 0) : 0
    }
  })

  return NextResponse.json({
    exam: {
      id: String(exam.id),
      exam_title: normalizeText(exam.exam_title),
      grade_id: exam.grade_id ? String(exam.grade_id) : null,
      grade_name: gradesRes.data?.name ? normalizeText(gradesRes.data.name) : null,
      subject_name: normalizeText(exam.subject_name),
      exam_date: exam.exam_date || null,
      status: normalizeText(exam.status) || 'Draft',
      description: normalizeText(exam.description) || null,
      academic_year: normalizeText(exam?.metadata?.academic_year) || null,
      school_id: exam?.metadata?.school_id ? String(exam.metadata.school_id) : null,
      created_at: exam.created_at
    },
    counts: {
      papers: papers.length,
      students: studentsRes.count || 0,
      sheets: sheetsRes.count || 0,
      graded: gradedCount
    },
    papers
  })
}

