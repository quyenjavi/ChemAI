import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export async function POST(req: Request, { params }: { params: { examId: string, attemptId: string } }) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const attemptAnswerId = String(body.attempt_answer_id || '').trim()
    const scoreAwarded = Number(body.score_awarded)
    const note = String(body.note || '').trim()
    if (!attemptAnswerId) return NextResponse.json({ error: 'attempt_answer_id is required' }, { status: 400 })
    if (!isFinite(scoreAwarded) || scoreAwarded < 0) return NextResponse.json({ error: 'score_awarded is invalid' }, { status: 400 })

    const svc = serviceRoleClient()
    const { data: teacher } = await svc
      .from('teacher_profiles')
      .select('user_id,can_create_exam,school_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!teacher || !teacher.can_create_exam) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: exam } = await svc.from('official_exams').select('id,school_id').eq('id', params.examId).maybeSingle()
    if (!exam || exam.school_id !== teacher.school_id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data: attempt } = await svc
      .from('official_exam_attempts')
      .select('id,official_exam_id')
      .eq('id', params.attemptId)
      .eq('official_exam_id', params.examId)
      .maybeSingle()
    if (!attempt) return NextResponse.json({ error: 'Attempt not found' }, { status: 404 })

    const { data: answer } = await svc
      .from('official_exam_attempt_answers')
      .select('id,attempt_id,official_exam_id,score_awarded')
      .eq('id', attemptAnswerId)
      .eq('attempt_id', params.attemptId)
      .eq('official_exam_id', params.examId)
      .maybeSingle()
    if (!answer) return NextResponse.json({ error: 'Attempt answer not found' }, { status: 404 })

    const nowIso = new Date().toISOString()
    const { error: updErr } = await svc
      .from('official_exam_attempt_answers')
      .update({ score_awarded: scoreAwarded, review_status: 'adjusted', updated_at: nowIso } as any)
      .eq('id', attemptAnswerId)
      .eq('attempt_id', params.attemptId)
      .eq('official_exam_id', params.examId)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 })

    await svc
      .from('official_exam_reviews')
      .insert({
        official_exam_id: params.examId,
        attempt_id: params.attemptId,
        attempt_answer_id: attemptAnswerId,
        status: 'adjusted',
        note: note || null,
        created_at: nowIso,
      } as any)

    const { data: allAnswers } = await svc
      .from('official_exam_attempt_answers')
      .select('selected_answer,correct_answer,is_correct,score_awarded')
      .eq('attempt_id', params.attemptId)
      .eq('official_exam_id', params.examId)

    let totalScore = 0
    let correct = 0
    let incorrect = 0
    let blank = 0
    for (const a of allAnswers || []) {
      totalScore += Number((a as any).score_awarded || 0)
      const selected = (a as any).selected_answer
      const ic = (a as any).is_correct
      if (!selected) blank += 1
      else if (ic === true) correct += 1
      else if (ic === false) incorrect += 1
    }

    const { error: attErr } = await svc
      .from('official_exam_attempts')
      .update({
        total_score: Math.round(totalScore * 100) / 100,
        correct_count: correct,
        incorrect_count: incorrect,
        blank_count: blank,
        status: 'graded_adjusted',
        updated_at: nowIso,
      } as any)
      .eq('id', params.attemptId)
      .eq('official_exam_id', params.examId)
    if (attErr) return NextResponse.json({ error: attErr.message }, { status: 400 })

    await svc
      .from('official_exam_processing_logs')
      .insert({
        official_exam_id: params.examId,
        attempt_id: params.attemptId,
        status: 'review_adjusted',
        message: `Adjusted answer ${attemptAnswerId} score=${scoreAwarded}`,
        created_at: nowIso,
      } as any)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}

