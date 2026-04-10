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
    .select('id, school_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!teacher?.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const schoolId = teacher.school_id ? String(teacher.school_id) : null
  if (!schoolId) return NextResponse.json({ items: [] })

  const { data: exams, error: examsErr } = await svc
    .from('official_exams')
    .select('id, title, school_id, grade_id, exam_date, status, total_students, total_sheets, published_at')
    .eq('school_id', schoolId)
    .order('published_at', { ascending: false })
    .limit(200)

  if (examsErr) return NextResponse.json({ error: examsErr.message }, { status: 500 })

  const examIds = (exams || []).map((e: any) => String(e.id)).filter(Boolean)
  const { data: paperRows, error: papersErr } = examIds.length
    ? await svc.from('official_exam_papers').select('id, official_exam_id').in('official_exam_id', examIds).limit(200000)
    : { data: [] as any[], error: null as any }
  if (papersErr) return NextResponse.json({ error: papersErr.message }, { status: 500 })

  const papersCountByExamId: Record<string, number> = {}
  for (const r of (paperRows || []) as any[]) {
    const eid = r.official_exam_id ? String(r.official_exam_id) : ''
    if (!eid) continue
    papersCountByExamId[eid] = (papersCountByExamId[eid] || 0) + 1
  }

  const items = (exams || []).map((e: any) => ({
    id: String(e.id),
    title: normalizeText(e.title),
    grade_id: e.grade_id ? String(e.grade_id) : null,
    exam_date: e.exam_date || null,
    status: normalizeText(e.status) || null,
    papers_count: papersCountByExamId[String(e.id)] || 0,
    students_count: Number(e.total_students) || 0,
    sheets_count: Number(e.total_sheets) || 0
  }))

  return NextResponse.json({ items })
}
