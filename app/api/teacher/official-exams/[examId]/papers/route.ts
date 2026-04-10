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

  const { data: exam } = await svc.from('official_exams').select('id, school_id').eq('id', examId).maybeSingle()
  if (!exam || String(exam.school_id) !== schoolId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: papers, error } = await svc
    .from('official_exam_papers')
    .select('id, paper_code, lesson_id')
    .eq('official_exam_id', examId)
    .order('paper_code', { ascending: true })
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const lessonIds = Array.from(new Set((papers || []).map((p: any) => p.lesson_id ? String(p.lesson_id) : '').filter(Boolean)))
  const { data: lessons, error: lessonErr } = lessonIds.length
    ? await svc.from('lessons').select('id, title').in('id', lessonIds).limit(5000)
    : { data: [] as any[], error: null as any }
  if (lessonErr) return NextResponse.json({ error: lessonErr.message }, { status: 500 })
  const lessonTitleById: Record<string, string> = {}
  for (const l of (lessons || []) as any[]) {
    if (l?.id) lessonTitleById[String(l.id)] = normalizeText(l.title)
  }

  return NextResponse.json({
    papers: (papers || []).map((p: any) => ({
      id: String(p.id),
      paper_code: normalizeText(p.paper_code),
      lesson_id: p.lesson_id ? String(p.lesson_id) : null,
      lesson_title: p.lesson_id ? (lessonTitleById[String(p.lesson_id)] || null) : null
    }))
  })
}

export async function POST(req: Request, { params }: { params: { examId: string } }) {
  const examId = params.examId
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const id = body.id == null ? '' : String(body.id)
  const paper_code = normalizeText(body.paper_code)
  const lesson_id = normalizeText(body.lesson_id)
  if (!paper_code) return NextResponse.json({ error: 'Thiếu mã đề' }, { status: 400 })
  if (!lesson_id) return NextResponse.json({ error: 'Thiếu lesson_id' }, { status: 400 })

  const svc = serviceRoleClient()
  const { data: teacher } = await svc.from('teacher_profiles').select('id, school_id').eq('user_id', user.id).maybeSingle()
  if (!teacher?.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const schoolId = teacher.school_id ? String(teacher.school_id) : null
  if (!schoolId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: exam } = await svc.from('official_exams').select('id, school_id').eq('id', examId).maybeSingle()
  if (!exam || String(exam.school_id) !== schoolId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (id) {
    const { error } = await svc
      .from('official_exam_papers')
      .update({ paper_code, lesson_id } as any)
      .eq('id', id)
      .eq('official_exam_id', examId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, id })
  }

  const { data: existing } = await svc
    .from('official_exam_papers')
    .select('id')
    .eq('official_exam_id', examId)
    .eq('paper_code', paper_code)
    .maybeSingle()

  if (existing?.id) {
    const { error } = await svc
      .from('official_exam_papers')
      .update({ lesson_id } as any)
      .eq('id', existing.id)
      .eq('official_exam_id', examId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, id: String(existing.id) })
  }

  const { data: inserted, error: insErr } = await svc
    .from('official_exam_papers')
    .insert({ official_exam_id: examId, paper_code, lesson_id } as any)
    .select('id')
    .single()
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: String(inserted.id) })
}

export async function DELETE(req: Request, { params }: { params: { examId: string } }) {
  const examId = params.examId
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const id = body.id == null ? '' : String(body.id)
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const svc = serviceRoleClient()
  const { data: teacher } = await svc.from('teacher_profiles').select('id, school_id').eq('user_id', user.id).maybeSingle()
  if (!teacher?.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const schoolId = teacher.school_id ? String(teacher.school_id) : null
  if (!schoolId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: exam } = await svc.from('official_exams').select('id, school_id').eq('id', examId).maybeSingle()
  if (!exam || String(exam.school_id) !== schoolId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await svc
    .from('official_exam_papers')
    .delete()
    .eq('id', id)
    .eq('official_exam_id', examId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
