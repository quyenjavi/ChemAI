import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

function normalizeText(v: any) {
  return String(v ?? '').trim()
}

export async function GET(req: Request, { params }: { params: { examId: string } }) {
  const examId = params.examId
  const url = new URL(req.url)
  const limit = Math.min(2000, Math.max(1, Number(url.searchParams.get('limit') || 200)))

  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = serviceRoleClient()
  const { data: teacher } = await svc.from('teacher_profiles').select('id').eq('user_id', user.id).maybeSingle()
  if (!teacher?.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: exam } = await svc.from('official_exams').select('id, teacher_id').eq('id', examId).maybeSingle()
  if (!exam || String(exam.teacher_id) !== String(teacher.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: attempts, error } = await svc
    .from('official_exam_attempts')
    .select('id, student_id, sheet_id, paper_id, raw_score, total_score, correct_count, wrong_count, blank_count, grading_status, status, graded_at')
    .eq('official_exam_id', examId)
    .order('graded_at', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const studentIds = Array.from(new Set((attempts || []).map((a: any) => String(a.student_id || '')).filter(Boolean)))
  const paperIds = Array.from(new Set((attempts || []).map((a: any) => String(a.paper_id || '')).filter(Boolean)))

  const [studentsRes, papersRes] = await Promise.all([
    studentIds.length ? svc.from('official_exam_students').select('id, student_code, full_name, class_name').in('id', studentIds).limit(50000) : Promise.resolve({ data: [] as any[] }),
    paperIds.length ? svc.from('official_exam_papers').select('id, paper_code, metadata').in('id', paperIds).limit(5000) : Promise.resolve({ data: [] as any[] })
  ])

  const studentById: Record<string, any> = {}
  for (const s of (studentsRes.data || []) as any[]) studentById[String(s.id)] = s

  const paperById: Record<string, any> = {}
  const lessonIds = new Set<string>()
  for (const p of (papersRes.data || []) as any[]) {
    paperById[String(p.id)] = p
    const lid = p?.metadata?.lesson_id ? String(p.metadata.lesson_id) : ''
    if (lid) lessonIds.add(lid)
  }

  const lessonById: Record<string, any> = {}
  if (lessonIds.size) {
    const { data: lessons } = await svc.from('lessons').select('id, title').in('id', Array.from(lessonIds)).limit(2000)
    for (const l of (lessons || []) as any[]) lessonById[String(l.id)] = l
  }

  const rows = (attempts || []).map((a: any) => {
    const student = studentById[String(a.student_id)] || null
    const paper = paperById[String(a.paper_id)] || null
    const lessonId = paper?.metadata?.lesson_id ? String(paper.metadata.lesson_id) : null
    const lesson = lessonId ? lessonById[lessonId] : null
    return {
      id: String(a.id),
      student_code: normalizeText(student?.student_code) || null,
      full_name: normalizeText(student?.full_name) || null,
      class_name: normalizeText(student?.class_name) || null,
      paper_code: normalizeText(paper?.paper_code) || null,
      lesson_title: normalizeText(lesson?.title) || null,
      raw_score: a.raw_score,
      total_score: a.total_score,
      correct_count: a.correct_count,
      wrong_count: a.wrong_count,
      blank_count: a.blank_count,
      grading_status: normalizeText(a.grading_status) || null,
      review_status: normalizeText(a.status) || null,
      graded_at: a.graded_at
    }
  })

  return NextResponse.json({ items: rows })
}

