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

  const { data: exam } = await svc.from('official_exams').select('id, teacher_id, grade_id').eq('id', examId).maybeSingle()
  if (!exam || String(exam.teacher_id) !== String(teacher.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [papersRes, lessonsRes] = await Promise.all([
    svc.from('official_exam_papers').select('id, paper_code, process_status, metadata').eq('official_exam_id', examId).order('paper_code', { ascending: true }).limit(200),
    svc.from('lessons').select('id, title, grade_id, is_visible').eq('grade_id', exam.grade_id).order('created_at', { ascending: false }).limit(500)
  ])

  return NextResponse.json({
    papers: (papersRes.data || []).map((p: any) => ({
      id: String(p.id),
      paper_code: normalizeText(p.paper_code),
      process_status: normalizeText(p.process_status) || 'uploaded',
      lesson_id: p?.metadata?.lesson_id ? String(p.metadata.lesson_id) : null
    })),
    lessons: (lessonsRes.data || []).map((l: any) => ({
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
  const paper_code = normalizeText(body.paper_code)
  const lesson_id = normalizeText(body.lesson_id)
  if (!paper_code) return NextResponse.json({ error: 'Thiếu mã đề' }, { status: 400 })
  if (!lesson_id) return NextResponse.json({ error: 'Thiếu lesson' }, { status: 400 })

  const svc = serviceRoleClient()
  const { data: teacher } = await svc.from('teacher_profiles').select('id').eq('user_id', user.id).maybeSingle()
  if (!teacher?.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: exam } = await svc.from('official_exams').select('id, teacher_id').eq('id', examId).maybeSingle()
  if (!exam || String(exam.teacher_id) !== String(teacher.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: existing } = await svc
    .from('official_exam_papers')
    .select('id, metadata')
    .eq('official_exam_id', examId)
    .eq('paper_code', paper_code)
    .maybeSingle()

  const nextMeta = { ...(existing?.metadata || {}), lesson_id }
  if (existing?.id) {
    const { error } = await svc
      .from('official_exam_papers')
      .update({ metadata: nextMeta, process_status: 'uploaded' })
      .eq('id', existing.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, id: existing.id })
  }

  const { data: created, error } = await svc
    .from('official_exam_papers')
    .insert({
      official_exam_id: examId,
      paper_code,
      file_url: null,
      process_status: 'uploaded',
      metadata: nextMeta
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: created.id })
}

