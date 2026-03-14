import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

const parseSelectedBool = (v: any): boolean | null => {
  if (v === true || v === 'true') return true
  if (v === false || v === 'false') return false
  if (v === 'A') return true
  if (v === 'B') return false
  return null
}

const getStatementCorrect = (row: any): boolean | null => {
  if (typeof row?.is_correct === 'boolean') return row.is_correct
  if (typeof row?.correct_answer === 'boolean') return row.correct_answer
  if (typeof row?.is_true === 'boolean') return row.is_true
  if (typeof row?.correct_value === 'boolean') return row.correct_value
  if (typeof row?.answer === 'boolean') return row.answer
  return null
}

export async function GET(_: Request, { params }: { params: { attemptId: string } }) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const svc = serviceRoleClient()
    const { data: att } = await svc.from('quiz_attempts').select('id,user_id').eq('id', params.attemptId).maybeSingle()
    if (!att || att.user_id !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const { data: rows } = await svc
      .from('quiz_attempt_answers')
      .select('question_id, statement_id, selected_answer, answer_text, is_correct, score_awarded, max_score, grading_method, ai_score, ai_feedback')
      .eq('attempt_id', params.attemptId)
    const qIds = Array.from(new Set((rows || []).map((r: any) => r.question_id).filter(Boolean)))
    if (!qIds.length) return NextResponse.json({ answers: [] })

    const { data: qs } = await svc
      .from('questions')
      .select('id, content, question_type, order_index, topic, brief_explanation, explanation, tip, image_url, image_alt, image_caption')
      .in('id', qIds)
    const qById: Record<string, any> = Object.fromEntries((qs || []).map((q: any) => [q.id, q]))

    const orderedQuestions = qIds
      .map((id) => qById[id])
      .filter(Boolean)
      .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0))

    const typeById: Record<string, string> = Object.fromEntries(orderedQuestions.map((q: any) => [q.id, q.question_type]))

    const choiceIds = orderedQuestions.filter((q: any) => q.question_type === 'single_choice' || q.question_type === 'true_false').map((q: any) => q.id)
    const groupIds = orderedQuestions.filter((q: any) => q.question_type === 'true_false_group').map((q: any) => q.id)
    const saIds = orderedQuestions.filter((q: any) => q.question_type === 'short_answer').map((q: any) => q.id)

    let optionsByQ: Record<string, Array<{ key: string, text: string, is_correct: boolean }>> = {}
    if (choiceIds.length) {
      const { data: opts } = await svc
        .from('question_options')
        .select('question_id, option_key, option_text, is_correct, sort_order')
        .in('question_id', choiceIds)
        .order('sort_order', { ascending: true })
      for (const o of (opts || []) as any[]) {
        const arr = optionsByQ[o.question_id] || []
        arr.push({ key: o.option_key, text: o.option_text, is_correct: !!o.is_correct })
        optionsByQ[o.question_id] = arr
      }
    }

    let statementsByQ: Record<string, any[]> = {}
    if (groupIds.length) {
      const { data: st } = await svc
        .from('question_statements')
        .select('*')
        .in('question_id', groupIds)
        .order('sort_order', { ascending: true })
      for (const r of (st || []) as any[]) {
        const arr = statementsByQ[r.question_id] || []
        arr.push(r)
        statementsByQ[r.question_id] = arr
      }
    }

    let refArrById: Record<string, string[]> = {}
    let saTipById: Record<string, string> = {}
    if (saIds.length) {
      const { data: refs } = await svc
        .from('question_short_answers')
        .select('*')
        .in('question_id', saIds)
      const grouped: Record<string, string[]> = {}
      for (const r of (refs || []) as any[]) {
        grouped[r.question_id] = grouped[r.question_id] || []
        grouped[r.question_id].push(r.answer_text || '')
        const tip = String((r as any)?.tip || '').trim()
        if (tip) saTipById[r.question_id] = saTipById[r.question_id] || tip
      }
      for (const k of Object.keys(grouped)) {
        refArrById[k] = grouped[k].filter(Boolean)
      }
    }

    const rowsByQ: Record<string, any[]> = {}
    for (const r of (rows || []) as any[]) {
      const arr = rowsByQ[r.question_id] || []
      arr.push(r)
      rowsByQ[r.question_id] = arr
    }

    const payload = orderedQuestions.map((q: any) => {
      const qid = q.id as string
      const typ = q.question_type as string
      const aRows = rowsByQ[qid] || []
      const base = {
        question_id: qid,
        content: q.content || '',
        question_type: typ,
        order_index: q.order_index ?? 0,
        topic: q.topic || '',
        explanation: q.brief_explanation || q.explanation || '',
        tip: q.tip || '',
        image_url: q.image_url || '',
        image_alt: q.image_alt || '',
        image_caption: q.image_caption || ''
      }

      if (typ === 'true_false_group') {
        const st = (statementsByQ[qid] || []).slice().sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        const byStId: Record<string, any> = Object.fromEntries(aRows.filter(x => x.statement_id).map(x => [x.statement_id, x]))
        const statements = st.map((s: any) => {
          const ar = byStId[s.id]
          const selected = parseSelectedBool(ar?.selected_answer)
          return {
            statement_id: s.id,
            text: s.statement_text || '',
            sort_order: s.sort_order ?? 0,
            selected_answer: selected,
            is_correct: typeof ar?.is_correct === 'boolean' ? ar.is_correct : null,
            correct_answer: getStatementCorrect(s),
            score_awarded: ar?.score_awarded ?? null,
            max_score: ar?.max_score ?? null,
            grading_method: ar?.grading_method ?? null,
            explanation: s.explanation || s.brief_explanation || '',
            tip: s.tip || ''
          }
        })
        return { ...base, statements }
      }

      if (typ === 'short_answer') {
        const ar = aRows[0]
        return {
          ...base,
          answer_text: ar?.answer_text ?? null,
          is_correct: typeof ar?.is_correct === 'boolean' ? ar.is_correct : null,
          score_awarded: ar?.score_awarded ?? null,
          max_score: ar?.max_score ?? null,
          grading_method: ar?.grading_method ?? null,
          ai_score: ar?.ai_score ?? null,
          ai_feedback: ar?.ai_feedback ?? null,
          reference_answers: refArrById[qid] || [],
          tip: base.tip || saTipById[qid] || ''
        }
      }

      if (typ === 'single_choice' || typ === 'true_false') {
        const ar = aRows[0]
        const options = optionsByQ[qid] || []
        const correct = options.find(o => o.is_correct)
        const selectedKey = (ar?.selected_answer || null) as string | null
        const selectedText = selectedKey ? (options.find(o => o.key === selectedKey)?.text || null) : null
        return {
          ...base,
          selected_answer: selectedKey,
          selected_text: selectedText,
          correct_key: correct?.key || null,
          correct_text: correct?.text || null,
          is_correct: typeof ar?.is_correct === 'boolean' ? ar.is_correct : null,
          score_awarded: ar?.score_awarded ?? null,
          max_score: ar?.max_score ?? null,
          grading_method: ar?.grading_method ?? null
        }
      }

      const ar = aRows[0]
      return {
        ...base,
        selected_answer: ar?.selected_answer ?? null,
        answer_text: ar?.answer_text ?? null,
        is_correct: typeof ar?.is_correct === 'boolean' ? ar.is_correct : null,
        score_awarded: ar?.score_awarded ?? null,
        max_score: ar?.max_score ?? null,
        grading_method: ar?.grading_method ?? null
      }
    })

    return NextResponse.json({ answers: payload })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
