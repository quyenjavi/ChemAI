import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

function normalizeDifficulty(v: any) {
  const s = String(v || '').trim()
  const ok = new Set(['biet', 'hieu', 'van_dung', 'van_dung_cao'])
  return ok.has(s) ? s : null
}

export async function POST(req: Request, { params }: { params: { lessonId: string, questionId: string } }) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const content = body.content == null ? undefined : String(body.content || '').trim()
    const tip = body.tip == null ? undefined : String(body.tip || '')
    const explanation = body.explanation == null ? undefined : String(body.explanation || '')
    const image_url = body.image_url == null ? undefined : String(body.image_url || '').trim() || null
    const exam_score = body.exam_score == null ? undefined : Number(body.exam_score)
    const topic_unit = body.topic_unit == null ? undefined : String(body.topic_unit || '').trim() || null
    const difficulty_academic = body.difficulty_academic == null ? undefined : normalizeDifficulty(body.difficulty_academic)

    const svc = serviceRoleClient()
    const { data: teacher } = await svc.from('teacher_profiles').select('id').eq('user_id', user.id).maybeSingle()
    if (!teacher) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: q } = await svc
      .from('questions')
      .select('id,lesson_id,question_type')
      .eq('id', params.questionId)
      .eq('lesson_id', params.lessonId)
      .maybeSingle()
    if (!q) return NextResponse.json({ error: 'Question not found' }, { status: 404 })

    const nowIso = new Date().toISOString()
    const patch: any = { updated_at: nowIso }
    if (content !== undefined) {
      if (!content) return NextResponse.json({ error: 'content is required' }, { status: 400 })
      patch.content = content
    }
    if (tip !== undefined) patch.tip = tip
    if (explanation !== undefined) patch.explanation = explanation
    if (image_url !== undefined) patch.image_url = image_url
    if (exam_score !== undefined) patch.exam_score = isFinite(exam_score as any) ? exam_score : null
    if (topic_unit !== undefined) {
      patch.topic_unit = topic_unit
      patch.topic = topic_unit
    }
    if (difficulty_academic !== undefined) {
      patch.difficulty_academic = difficulty_academic
    }

    const upd = await svc.from('questions').update(patch).eq('id', params.questionId).eq('lesson_id', params.lessonId).select('*').single()
    if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 400 })

    const questionType = String((q as any).question_type || '')

    if (body.options !== undefined && questionType === 'single_choice') {
      await svc.from('question_options').delete().eq('question_id', params.questionId)
      const options = Array.isArray(body.options) ? body.options : []
      const rows = options.map((o: any, idx: number) => ({
        question_id: params.questionId,
        option_key: String(o.option_key || '').trim(),
        option_text: String(o.content || '').trim(),
        is_correct: !!o.is_correct,
        sort_order: idx + 1,
        created_at: nowIso,
      })).filter((o: any) => o.option_key && o.option_text)
      if (rows.length) {
        const ins = await svc.from('question_options').insert(rows as any)
        if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 400 })
      }
    }

    if (body.statements !== undefined && questionType === 'true_false_group') {
      await svc.from('question_statements').delete().eq('question_id', params.questionId)
      const statements = Array.isArray(body.statements) ? body.statements : []
      const rows = statements.map((s: any, idx: number) => ({
        question_id: params.questionId,
        statement_key: String(s.statement_key || '').trim(),
        statement_text: String(s.content || '').trim(),
        correct_answer: s.correct_answer === true,
        score: s.score == null ? null : Number(s.score),
        explanation: s.explanation == null ? null : String(s.explanation || ''),
        tip: s.tip == null ? null : String(s.tip || ''),
        sort_order: idx + 1,
        created_at: nowIso,
      })).filter((s: any) => s.statement_key && s.statement_text)
      if (rows.length) {
        const ins = await svc.from('question_statements').insert(rows as any)
        if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 400 })
      }
    }

    if (body.short_answers !== undefined && questionType === 'short_answer') {
      await svc.from('question_short_answers').delete().eq('question_id', params.questionId)
      const answers = Array.isArray(body.short_answers) ? body.short_answers : []
      const rows = answers.map((a: any) => ({
        question_id: params.questionId,
        answer_text: String(a.content || '').trim(),
        score: a.score == null ? null : Number(a.score),
        explanation: a.explanation == null ? null : String(a.explanation || ''),
        tip: a.tip == null ? null : String(a.tip || ''),
        created_at: nowIso,
      })).filter((a: any) => a.answer_text)
      if (rows.length) {
        const ins = await svc.from('question_short_answers').insert(rows as any)
        if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 400 })
      }
    }

    return NextResponse.json({ question: upd.data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
