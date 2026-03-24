import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export async function GET(req: Request, { params }: { params: { lessonId: string } }) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const url = new URL(req.url)
    const attemptId = url.searchParams.get('attemptId')
    if (!attemptId) return NextResponse.json({ error: 'attemptId is required' }, { status: 400 })

    const svc = serviceRoleClient()

    // 1. Verify attempt ownership
    const { data: attempt } = await svc.from('quiz_attempts').select('id,user_id,lesson_id,mode').eq('id', attemptId).maybeSingle()
    if (!attempt || attempt.user_id !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // 2. Check for frozen questions first
    const { data: existingAQs } = await svc
      .from('quiz_attempt_questions')
      .select('question_id')
      .eq('attempt_id', attemptId)

    let finalQuestions: any[] = []

    // Helper: sort by type, then order_index (nulls last), then created_at
    const typeWeight = (t: string) =>
      t === 'single_choice' ? 1
      : (t === 'true_false' || t === 'true_false_group') ? 2
      : t === 'short_answer' ? 3
      : 4
    const sortQuestions = (arr: any[]) => {
      return [...arr].sort((a, b) => {
        const w = typeWeight(a.question_type) - typeWeight(b.question_type)
        if (w !== 0) return w
        const ao = (a.order_index ?? Infinity)
        const bo = (b.order_index ?? Infinity)
        if (ao !== bo) return ao - bo
        const at = a.created_at ? Date.parse(a.created_at) : 0
        const bt = b.created_at ? Date.parse(b.created_at) : 0
        return at - bt
      })
    }

    if (existingAQs && existingAQs.length > 0) {
      // 3a. Use existing frozen questions
      const qIds = existingAQs.map(aq => aq.question_id)
      const { data: qs } = await svc
        .from('questions')
        .select('id, content, question_type, order_index, topic, lesson_id, image_url, image_alt, image_caption, created_at')
        .in('id', qIds)
      
      finalQuestions = sortQuestions((qs || []).filter(Boolean))
    } else {
      // 3b. No frozen questions yet, pick them now and freeze
      const { data: allQs } = await svc
        .from('questions')
        .select('id, content, question_type, order_index, topic, lesson_id, image_url, image_alt, image_caption, created_at')
        .eq('lesson_id', params.lessonId)
        .limit(500)

      if (!allQs) throw new Error('Could not fetch questions')

      const rawN = url.searchParams.get('n')
      const parsedN = Number(rawN)
      const desiredCount = (rawN && Number.isFinite(parsedN) && parsedN > 0) ? Math.min(50, parsedN) : null

      const sorted = sortQuestions(allQs || [])
      const pickedQs = (attempt.mode !== 'exam' && desiredCount)
        ? sorted.slice(0, desiredCount)
        : sorted

      // Freeze them
      const inserts = pickedQs.map(q => ({ attempt_id: attemptId, question_id: q.id }))
      await svc.from('quiz_attempt_questions').insert(inserts)
      
      finalQuestions = pickedQs
    }

    const questions = finalQuestions as Array<{ id: string, content: string, question_type: string, order_index: number, topic?: string, lesson_id?: string, image_url?: string, image_alt?: string, image_caption?: string, created_at?: string }>

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
    return NextResponse.json({ lesson: { id: params.lessonId, lesson_type: attempt.mode }, questions: payload })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
