import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

function normalizeText(v: any) {
  return String(v ?? '').trim()
}

export async function GET() {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = serviceRoleClient()
  const { data: teacher } = await svc
    .from('teacher_profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!teacher?.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: exams, error: examsErr } = await svc
    .from('official_exams')
    .select('id, exam_title, grade_id, subject_name, exam_date, status, is_visible')
    .eq('teacher_id', teacher.id)
    .eq('is_visible', true)
    .order('created_at', { ascending: false })
    .limit(200)

  if (examsErr) return NextResponse.json({ error: examsErr.message }, { status: 500 })
  const examIds = (exams || []).map((e) => e.id)

  const [papersRes, studentsRes, sheetsRes, attemptsRes, gradesRes] = await Promise.all([
    svc.from('official_exam_papers').select('id, official_exam_id, process_status').in('official_exam_id', examIds).limit(5000),
    svc.from('official_exam_students').select('id, official_exam_id').in('official_exam_id', examIds).limit(200000),
    svc.from('official_exam_sheets').select('id, official_exam_id').in('official_exam_id', examIds).limit(200000),
    svc.from('official_exam_attempts').select('id, official_exam_id, grading_status').in('official_exam_id', examIds).limit(200000),
    svc.from('grades').select('id, name').limit(200)
  ])

  const gradeNameById: Record<string, string> = {}
  for (const g of (gradesRes.data || []) as any[]) gradeNameById[String(g.id)] = normalizeText(g.name)

  const papersCount: Record<string, number> = {}
  for (const p of (papersRes.data || []) as any[]) {
    const id = String(p.official_exam_id)
    papersCount[id] = (papersCount[id] || 0) + 1
  }

  const studentsCount: Record<string, number> = {}
  for (const s of (studentsRes.data || []) as any[]) {
    const id = String(s.official_exam_id)
    studentsCount[id] = (studentsCount[id] || 0) + 1
  }

  const sheetsCount: Record<string, number> = {}
  for (const s of (sheetsRes.data || []) as any[]) {
    const id = String(s.official_exam_id)
    sheetsCount[id] = (sheetsCount[id] || 0) + 1
  }

  const gradedCount: Record<string, number> = {}
  for (const a of (attemptsRes.data || []) as any[]) {
    const id = String(a.official_exam_id)
    if (normalizeText(a.grading_status) === 'graded') gradedCount[id] = (gradedCount[id] || 0) + 1
  }

  const items = (exams || []).map((e: any) => ({
    id: String(e.id),
    exam_title: normalizeText(e.exam_title),
    grade_id: e.grade_id ? String(e.grade_id) : null,
    grade_name: e.grade_id ? (gradeNameById[String(e.grade_id)] || null) : null,
    subject_name: normalizeText(e.subject_name) || null,
    exam_date: e.exam_date || null,
    status: normalizeText(e.status) || null,
    papers_count: papersCount[String(e.id)] || 0,
    students_count: studentsCount[String(e.id)] || 0,
    sheets_count: sheetsCount[String(e.id)] || 0,
    graded_count: gradedCount[String(e.id)] || 0
  }))

  return NextResponse.json({ items })
}

