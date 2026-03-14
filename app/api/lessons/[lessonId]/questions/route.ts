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
    const { data: lesson } = await svc
      .from('lessons')
      .select('id,lesson_type')
      .eq('id', params.lessonId)
      .maybeSingle()
    const lessonType = (lesson?.lesson_type === 'exam' || lesson?.lesson_type === 'practice') ? lesson.lesson_type : 'practice'
    const { data: qs } = await svc
      .from('questions')
      .select('id, content, question_type, order_index, topic, lesson_id, image_url, image_alt, image_caption')
      .eq('lesson_id', params.lessonId)
      .order('order_index', { ascending: true })
      .limit(200)
    const questions = (qs || []) as Array<{ id: string, content: string, question_type: string, order_index: number, topic?: string, lesson_id?: string, image_url?: string, image_alt?: string, image_caption?: string }>
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
    const tfGroupIds = questions.filter(q => q.question_type === 'true_false_group').map(q => q.id)
    let statementsByQ: Record<string, Array<{ id: string, text: string, sort_order: number }>> = {}
    if (tfGroupIds.length) {
      const { data: st } = await svc
        .from('question_statements')
        .select('id, question_id, statement_text, sort_order')
        .in('question_id', tfGroupIds)
        .order('sort_order', { ascending: true })
      for (const r of (st || []) as Array<any>) {
        const arr = statementsByQ[r.question_id] || []
        arr.push({ id: r.id, text: r.statement_text || '', sort_order: r.sort_order ?? 0 })
        statementsByQ[r.question_id] = arr
      }
    }
    const payload = questions.map(q => {
      const opts = optionsByQ[q.id] || []
      return {
        id: q.id,
        question_id: q.id,
        content: q.content,
        question_type: q.question_type,
        order_index: q.order_index,
        topic: q.topic || '',
        lesson_id: q.lesson_id || params.lessonId,
        options: opts,
        statements: statementsByQ[q.id] || [],
        image_url: q.image_url || '',
        image_alt: q.image_alt || '',
        image_caption: q.image_caption || ''
      }
    })
    if (lessonType === 'exam') {
      return NextResponse.json({ lesson: { id: params.lessonId, lesson_type: lessonType }, questions: payload })
    }
    if (!desiredCount) {
      return NextResponse.json({ lesson: { id: params.lessonId, lesson_type: lessonType }, questions: payload })
    }
    const picked = shuffle(payload).slice(0, Math.min(desiredCount, payload.length)).sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
    return NextResponse.json({ lesson: { id: params.lessonId, lesson_type: lessonType }, questions: picked })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
