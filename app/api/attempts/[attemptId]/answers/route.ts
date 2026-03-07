import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

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
      .select('question_id, selected_answer, answer_text, ai_score, ai_feedback')
      .eq('attempt_id', params.attemptId)
    const qIds = Array.from(new Set((rows || []).map((r: any) => r.question_id)))
    const { data: qs } = await svc.from('questions').select('id, content, question_type').in('id', qIds)
    const typeById: Record<string, { question_type: string, content: string }> =
      Object.fromEntries((qs || []).map((q: any) => [q.id, { question_type: q.question_type, content: q.content }]))
    // correct options for choice
    const choiceIds = qIds.filter(id => ['single_choice','true_false'].includes(typeById[id]?.question_type))
    let correctById: Record<string, string> = {}
    let textByQKey: Record<string, Record<string, string>> = {}
    if (choiceIds.length) {
      const { data: opts } = await svc.from('question_options').select('question_id, option_key, option_text, is_correct').in('question_id', choiceIds)
      for (const o of (opts || []) as any[]) {
        const m = textByQKey[o.question_id] || {}
        m[o.option_key] = o.option_text
        textByQKey[o.question_id] = m
        if (o.is_correct) correctById[o.question_id] = o.option_key
      }
    }
    const payload = (rows || []).map((r: any) => {
      const qid = r.question_id
      const selected_key = r.selected_answer || null
      const correct_key = correctById[qid] || null
      const selected_text = selected_key ? (textByQKey[qid]?.[selected_key] || null) : null
      const correct_text = correct_key ? (textByQKey[qid]?.[correct_key] || null) : null
      return {
        question_id: qid,
        content: typeById[qid]?.content || '',
        question_type: typeById[qid]?.question_type || '',
        selected_answer: selected_key,
        selected_text,
        answer_text: r.answer_text || null,
        correct_key,
        correct_text,
        ai_score: r.ai_score ?? null,
        ai_feedback: r.ai_feedback ?? null
      }
    })
    return NextResponse.json({ answers: payload })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
