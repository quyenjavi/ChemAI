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

  const { data: exam } = await svc.from('official_exams').select('id, school_id, grade_id').eq('id', examId).maybeSingle()
  if (!exam || String(exam.school_id) !== schoolId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: lessons, error } = await svc
    .from('lessons')
    .select('id, title, is_visible, grade_id')
    .eq('grade_id', exam.grade_id)
    .order('created_at', { ascending: false })
    .limit(2000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    lessons: (lessons || []).map((l: any) => ({
      id: String(l.id),
      title: normalizeText(l.title),
      is_visible: l.is_visible !== false
    }))
  })
}

export async function POST(req: Request, { params }: { params: { examId: string } }) {
  const examId = params.examId
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const lesson_id = normalizeText(body.lesson_id)
  if (!lesson_id) return NextResponse.json({ error: 'lesson_id required' }, { status: 400 })

  const svc = serviceRoleClient()
  const { data: teacher } = await svc.from('teacher_profiles').select('id, school_id').eq('user_id', user.id).maybeSingle()
  if (!teacher?.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const schoolId = teacher.school_id ? String(teacher.school_id) : null
  if (!schoolId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: exam } = await svc.from('official_exams').select('id, school_id').eq('id', examId).maybeSingle()
  if (!exam || String(exam.school_id) !== schoolId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await svc
    .from('official_exams')
    .update({ lesson_id } as any)
    .eq('id', examId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
