import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export async function POST(req: Request, { params }: { params: { examId: string } }) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({} as any))
    const inputTitle = String(body?.title || '').trim()

    const svc = serviceRoleClient()
    const { data: teacher } = await svc
      .from('teacher_profiles')
      .select('user_id,can_create_exam')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!teacher || !teacher.can_create_exam) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: ex, error: exErr } = await svc
      .from('generated_exams')
      .select('id,lesson_id,lesson_ids,grade_id,title,matrix_config,scoring_config,total_questions,total_score,created_by')
      .eq('id', params.examId)
      .maybeSingle()
    if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 })
    if (!ex || (ex as any).created_by !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const title = inputTitle || `${ex.title} (copy)`
    if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })

    const { data: created, error: createErr } = await svc
      .from('generated_exams')
      .insert({
        lesson_id: ex.lesson_id,
        lesson_ids: (ex as any).lesson_ids || [ex.lesson_id],
        grade_id: ex.grade_id,
        title,
        matrix_config: ex.matrix_config,
        scoring_config: (ex as any).scoring_config || {},
        total_questions: (ex as any).total_questions ?? 0,
        total_score: (ex as any).total_score ?? 0,
        is_published: false,
        created_by: user.id
      })
      .select('id')
      .single()
    if (createErr) return NextResponse.json({ error: createErr.message }, { status: 500 })

    const newId = created.id as string
    const { data: oldQs, error: qErr } = await svc
      .from('generated_exam_questions')
      .select('question_id,order_index')
      .eq('exam_id', params.examId)
      .order('order_index', { ascending: true })
    if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })

    const inserts = (oldQs || []).map((r: any) => ({
      exam_id: newId,
      question_id: r.question_id,
      order_index: r.order_index
    }))
    if (inserts.length) {
      const { error: insErr } = await svc.from('generated_exam_questions').insert(inserts)
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, exam_id: newId })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
