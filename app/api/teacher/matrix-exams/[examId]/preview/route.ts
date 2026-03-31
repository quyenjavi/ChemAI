import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export async function GET(_: Request, { params }: { params: { examId: string } }) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const svc = serviceRoleClient()
    const { data: teacher } = await svc
      .from('teacher_profiles')
      .select('user_id,can_create_exam')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!teacher || !teacher.can_create_exam) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: exam, error: exErr } = await svc
      .from('generated_exams')
      .select('id,lesson_id,lesson_ids,grade_id,title,matrix_config,scoring_config,total_questions,total_score,is_published,created_at,created_by')
      .eq('id', params.examId)
      .maybeSingle()
    if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 })
    if (!exam || (exam as any).created_by !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data: gq, error: gqErr } = await svc
      .from('generated_exam_questions')
      .select('question_id,order_index')
      .eq('exam_id', params.examId)
      .order('order_index', { ascending: true })
    if (gqErr) return NextResponse.json({ error: gqErr.message }, { status: 500 })

    const qIds = (gq || []).map((r: any) => r.question_id).filter(Boolean)
    const { data: qs, error: qErr } = await svc
      .from('questions')
      .select('id,content,question_type,lesson_id,topic_unit,difficulty_academic,tip,explanation')
      .in('id', qIds)
    if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })
    const qMap = new Map((qs || []).map((q: any) => [q.id, q]))

    const lessonIds = Array.from(new Set((qs || []).map((q: any) => q.lesson_id).filter(Boolean)))
    const { data: lessonsRaw } = lessonIds.length
      ? await svc.from('lessons').select('id,title').in('id', lessonIds).limit(2000)
      : { data: [] as any[] }
    const lessonTitleById = new Map((lessonsRaw || []).map((l: any) => [l.id, l.title]))

    const { data: optionsRaw } = qIds.length
      ? await svc
          .from('question_options')
          .select('question_id,option_key,option_text,is_correct,sort_order')
          .in('question_id', qIds)
          .order('sort_order', { ascending: true })
      : { data: [] as any[] }
    const optionsByQuestion = new Map<string, any[]>()
    for (const row of Array.isArray(optionsRaw) ? optionsRaw : []) {
      if (!optionsByQuestion.has(row.question_id)) optionsByQuestion.set(row.question_id, [])
      optionsByQuestion.get(row.question_id)!.push({
        key: row.option_key || '',
        text: row.option_text || '',
        is_correct: row.is_correct === true,
        order: row.sort_order ?? 0
      })
    }

    const { data: statementsRaw } = qIds.length
      ? await svc
          .from('question_statements')
          .select('id,question_id,statement_key,statement_text,correct_answer,score,sort_order,explanation,tip')
          .in('question_id', qIds)
          .order('sort_order', { ascending: true })
      : { data: [] as any[] }
    const statementsByQuestion = new Map<string, any[]>()
    for (const row of Array.isArray(statementsRaw) ? statementsRaw : []) {
      if (!statementsByQuestion.has(row.question_id)) statementsByQuestion.set(row.question_id, [])
      statementsByQuestion.get(row.question_id)!.push({
        id: row.id,
        key: row.statement_key || '',
        text: row.statement_text || '',
        correct_answer: row.correct_answer === true,
        score: row.score ?? 0,
        order: row.sort_order ?? 0,
        explanation: row.explanation || '',
        tip: row.tip || ''
      })
    }

    const { data: shortAnswersRaw } = qIds.length
      ? await svc
          .from('question_short_answers')
          .select('id,question_id,answer_text,score,explanation,tip')
          .in('question_id', qIds)
      : { data: [] as any[] }
    const shortAnswersByQuestion = new Map<string, any[]>()
    for (const row of Array.isArray(shortAnswersRaw) ? shortAnswersRaw : []) {
      if (!shortAnswersByQuestion.has(row.question_id)) shortAnswersByQuestion.set(row.question_id, [])
      shortAnswersByQuestion.get(row.question_id)!.push({
        id: row.id,
        answer_text: row.answer_text || '',
        score: row.score ?? 0,
        explanation: row.explanation || '',
        tip: row.tip || ''
      })
    }

    const items = (gq || []).map((r: any) => {
      const q = qMap.get(r.question_id)
      return {
        order_index: r.order_index,
        question_id: r.question_id,
        question_type: q?.question_type || null,
        lesson_id: q?.lesson_id || null,
        lesson_title: q?.lesson_id ? (lessonTitleById.get(q.lesson_id) || null) : null,
        topic_unit: q?.topic_unit || null,
        difficulty_academic: q?.difficulty_academic || null,
        content: q?.content || '',
        tip: q?.tip || '',
        explanation: q?.explanation || '',
        options: optionsByQuestion.get(r.question_id) || [],
        statements: statementsByQuestion.get(r.question_id) || [],
        short_answers: shortAnswersByQuestion.get(r.question_id) || []
      }
    })

    return NextResponse.json({ exam, items })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
