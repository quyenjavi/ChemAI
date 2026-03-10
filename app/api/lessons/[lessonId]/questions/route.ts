import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export async function GET(req: Request, { params }: { params: { lessonId: string } }) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const url = new URL(req.url)
    const rawN = url.searchParams.get('n')
    const parsedN = Number(rawN)
    const desiredCount = (rawN && Number.isFinite(parsedN) && parsedN > 0) ? Math.min(50, parsedN) : null
    const svc = serviceRoleClient()
    const { data: qs } = await svc
      .from('questions')
      .select('id, content, question_type, order_index, topic, lesson_id')
      .eq('lesson_id', params.lessonId)
      .order('order_index', { ascending: true })
      .limit(50)
    const questions = (qs || []) as Array<{ id: string, content: string, question_type: string, order_index: number, topic?: string, lesson_id?: string }>
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
    // Fisher–Yates shuffle utility
    function shuffle<T>(arr: T[]): T[] {
      const a = [...arr]
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        const tmp = a[i]
        a[i] = a[j]
        a[j] = tmp
      }
      return a
    }
    const shortIds = questions.filter(q => q.question_type === 'short_answer').map(q => q.id)
    let acceptedByQ: Record<string, string[]> = {}
    if (shortIds.length) {
      const { data: sa } = await svc
        .from('question_short_answers')
        .select('question_id, answer_text')
        .in('question_id', shortIds)
      for (const r of (sa || []) as Array<any>) {
        const arr = acceptedByQ[r.question_id] || []
        if (r.answer_text) arr.push(r.answer_text)
        acceptedByQ[r.question_id] = arr
      }
    }
    const payload = questions.map(q => {
      const opts = optionsByQ[q.id] || []
      const accepted_answers = acceptedByQ[q.id] || []
      return {
        id: q.id,
        question_id: q.id,
        content: q.content,
        question_type: q.question_type,
        order_index: q.order_index,
        topic: q.topic || '',
        lesson_id: q.lesson_id || params.lessonId,
        options: opts,
        accepted_answers
      }
    })
    const shuffled = shuffle(payload)
    const selectedBase = desiredCount ? shuffled.slice(0, Math.min(desiredCount, shuffled.length)) : payload
    const typeOrder = (t: string) => (t === 'single_choice' ? 1 : (t === 'true_false' ? 2 : 3))
    const selected = [...selectedBase].sort((a, b) => {
      const ta = typeOrder(a.question_type || '')
      const tb = typeOrder(b.question_type || '')
      if (ta !== tb) return ta - tb
      return (a.order_index || 0) - (b.order_index || 0)
    })
    return NextResponse.json(selected)
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
