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

    const { data: exam } = await svc
      .from('exams')
      .select('id,title,description,grade_id,created_by,status,total_questions,created_at')
      .eq('id', params.examId)
      .maybeSingle()
    if (!exam || exam.created_by !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data: eqs, error: eqErr } = await svc
      .from('exam_questions')
      .select(`
        id,
        exam_id,
        blueprint_item_id,
        question_id,
        question_order,
        points,
        source_type,
        source_question_id,
        created_at,
        questions (
          id,
          content,
          question_type,
          lesson_id,
          topic_unit,
          difficulty_academic,
          difficulty,
          image_url,
          image_alt,
          image_caption,
          tip,
          explanation,
          created_at,
          lessons (
            id,
            title
          )
        )
      `)
      .eq('exam_id', params.examId)
      .order('question_order', { ascending: true })
    if (eqErr) return NextResponse.json({ error: eqErr.message }, { status: 500 })

    const qIds = (eqs || []).map((r: any) => r.question_id).filter(Boolean)

    const { data: optionsRaw } = qIds.length
      ? await svc
          .from('question_options')
          .select('question_id,option_key,option_text,is_correct,sort_order')
          .in('question_id', qIds)
          .order('sort_order', { ascending: true })
      : { data: [] as any[] }

    const { data: statementsRaw } = qIds.length
      ? await svc
          .from('question_statements')
          .select('id,question_id,statement_key,statement_text,correct_answer,score,sort_order,explanation,tip')
          .in('question_id', qIds)
          .order('sort_order', { ascending: true })
      : { data: [] as any[] }

    const { data: shortAnswersRaw } = qIds.length
      ? await svc
          .from('question_short_answers')
          .select('id,question_id,answer_text,score,explanation,tip')
          .in('question_id', qIds)
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

    const items = (eqs || []).map((r: any) => {
      const q = (r as any).questions
      const options = optionsByQuestion.get(r.question_id) || []
      const statements = statementsByQuestion.get(r.question_id) || []
      const short_answers = shortAnswersByQuestion.get(r.question_id) || []
      return {
        exam_question_id: r.id,
        question_order: r.question_order,
        points: r.points,
        blueprint_item_id: r.blueprint_item_id,
        question_id: r.question_id,
        source_type: r.source_type || null,
        source_question_id: r.source_question_id || null,
        question_type: q?.question_type || null,
        lesson_id: q?.lesson_id || null,
        lesson_title: q?.lessons?.title || null,
        topic_unit: q?.topic_unit ?? null,
        difficulty_academic: q?.difficulty_academic ?? null,
        difficulty: q?.difficulty ?? null,
        content: q?.content || '',
        image_url: q?.image_url || null,
        image_alt: q?.image_alt || null,
        image_caption: q?.image_caption || null,
        tip: q?.tip || '',
        explanation: q?.explanation || '',
        options,
        statements,
        short_answers
      }
    })

    return NextResponse.json({ exam, items })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
