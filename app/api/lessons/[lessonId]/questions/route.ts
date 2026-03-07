import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export async function GET(req: Request, { params }: { params: { lessonId: string } }) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const url = new URL(req.url)
    const nParam = Number(url.searchParams.get('n') || 0)
    const desiredCount = Math.max(0, Math.min(30, isFinite(nParam) ? nParam : 0))
    const svc = serviceRoleClient()
    const { data: qs } = await svc
      .from('questions')
      .select('id, content, question_type, order_index, topic, lesson_id, choice_a, choice_b, choice_c, choice_d, correct_answer')
      .eq('lesson_id', params.lessonId)
      .order('order_index', { ascending: true })
    const questions = (qs || []) as Array<{ id: string, content: string, question_type: string, order_index: number, topic?: string, lesson_id?: string, choice_a?: string, choice_b?: string, choice_c?: string, choice_d?: string, correct_answer?: string }>
    const ids = questions
      .filter(q => q.question_type === 'single_choice' || q.question_type === 'true_false')
      .map(q => q.id)
    let optionsByQ: Record<string, Array<{ key: string, text: string }>> = {}
    if (ids.length) {
      const { data: opts } = await svc
        .from('question_options')
        .select('question_id, option_key, option_text, sort_order')
        .in('question_id', ids)
        .order('sort_order', { ascending: true })
      for (const o of (opts || []) as Array<any>) {
        const arr = optionsByQ[o.question_id] || []
        arr.push({ key: o.option_key, text: o.option_text })
        optionsByQ[o.question_id] = arr
      }
    }
    let answeredCountByQ: Record<string, number> = {}
    if (desiredCount > 0) {
      const { data: atts } = await svc
        .from('quiz_attempts')
        .select('id')
        .eq('user_id', user.id)
        .eq('lesson_id', params.lessonId)
      const attemptIds = (atts || []).map(a => (a as any).id).filter(Boolean)
      if (attemptIds.length) {
        const { data: ans } = await svc
          .from('quiz_attempt_answers')
          .select('question_id, attempt_id')
          .in('attempt_id', attemptIds)
        for (const r of (ans || []) as any[]) {
          const qid = r.question_id
          answeredCountByQ[qid] = (answeredCountByQ[qid] || 0) + 1
        }
      }
    }
    const payload = questions.map(q => {
      let opts = optionsByQ[q.id] || []
      // Fallback for legacy data when question_options chưa có
      if ((!opts || opts.length === 0) && (q.question_type === 'single_choice' || q.question_type === 'true_false')) {
        if (q.question_type === 'single_choice') {
          const legacy = [
            q.choice_a ? { key: 'A', text: q.choice_a } : null,
            q.choice_b ? { key: 'B', text: q.choice_b } : null,
            q.choice_c ? { key: 'C', text: q.choice_c } : null,
            q.choice_d ? { key: 'D', text: q.choice_d } : null,
          ].filter(Boolean) as Array<{ key: string, text: string }>
          opts = legacy
        } else if (q.question_type === 'true_false') {
          opts = [
            { key: 'A', text: 'Đúng' },
            { key: 'B', text: 'Sai' }
          ]
        }
      }
      return {
        id: q.id,
        question_id: q.id,
        content: q.content,
        question_type: q.question_type,
        order_index: q.order_index,
        topic: q.topic || '',
        lesson_id: q.lesson_id || params.lessonId,
        options: opts
      }
    })
    let selected = payload
    if (desiredCount > 0) {
      const shuffled = [...payload].sort((a, b) => {
        const ca = answeredCountByQ[a.id] || 0
        const cb = answeredCountByQ[b.id] || 0
        if (ca !== cb) return ca - cb
        return Math.random() < 0.5 ? -1 : 1
      })
      selected = shuffled.slice(0, Math.min(desiredCount, shuffled.length))
    }
    return NextResponse.json(selected)
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
