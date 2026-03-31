import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

function round4(n: number) {
  return Math.round(n * 10000) / 10000
}

export async function POST(_: Request, { params }: { params: { examId: string } }) {
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

    const { data: ex } = await svc
      .from('generated_exams')
      .select('id,is_published,created_by,grade_id,title,scoring_config')
      .eq('id', params.examId)
      .maybeSingle()
    if (!ex || (ex as any).created_by !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (ex.is_published) return NextResponse.json({ error: 'Already published' }, { status: 400 })

    const { data: gq, error: gqErr } = await svc
      .from('generated_exam_questions')
      .select('question_id,order_index')
      .eq('exam_id', params.examId)
      .order('order_index', { ascending: true })
    if (gqErr) return NextResponse.json({ error: gqErr.message }, { status: 500 })
    if (!gq?.length) return NextResponse.json({ error: 'Exam has no questions' }, { status: 400 })

    const nowIso = new Date().toISOString()
    const { data: lessonRow, error: lessonErr } = await svc
      .from('lessons')
      .insert({
        grade_id: (ex as any).grade_id,
        title: (ex as any).title,
        description: null,
        lesson_type: 'exam',
        is_visible: true,
        question_count: 0,
        is_teacher_recommended: false,
        display_order: null
      })
      .select('id')
      .single()
    if (lessonErr) return NextResponse.json({ error: lessonErr.message }, { status: 500 })

    const lessonId = lessonRow.id as string
    const qIds = (gq || []).map((r: any) => r.question_id).filter(Boolean)
    const { data: qs, error: qErr } = await svc
      .from('questions')
      .select('id,content,question_type,difficulty,difficulty_academic,topic,topic_unit,image_url,image_alt,image_caption,brief_explanation,tip,explanation')
      .in('id', qIds)
    if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })
    const qMap = new Map((qs || []).map((q: any) => [q.id, q]))

    const { data: optionsRaw } = await svc
      .from('question_options')
      .select('question_id,option_key,option_text,is_correct,sort_order')
      .in('question_id', qIds)
      .order('sort_order', { ascending: true })
    const optionsByQuestion = new Map<string, any[]>()
    for (const row of Array.isArray(optionsRaw) ? optionsRaw : []) {
      if (!optionsByQuestion.has(row.question_id)) optionsByQuestion.set(row.question_id, [])
      optionsByQuestion.get(row.question_id)!.push(row)
    }

    const { data: stRaw } = await svc
      .from('question_statements')
      .select('question_id,statement_key,statement_text,correct_answer,score,sort_order,explanation,tip')
      .in('question_id', qIds)
      .order('sort_order', { ascending: true })
    const statementsByQuestion = new Map<string, any[]>()
    for (const row of Array.isArray(stRaw) ? stRaw : []) {
      if (!statementsByQuestion.has(row.question_id)) statementsByQuestion.set(row.question_id, [])
      statementsByQuestion.get(row.question_id)!.push(row)
    }

    const { data: saRaw } = await svc
      .from('question_short_answers')
      .select('question_id,answer_text,score,explanation,tip')
      .in('question_id', qIds)
    const shortAnswersByQuestion = new Map<string, any[]>()
    for (const row of Array.isArray(saRaw) ? saRaw : []) {
      if (!shortAnswersByQuestion.has(row.question_id)) shortAnswersByQuestion.set(row.question_id, [])
      shortAnswersByQuestion.get(row.question_id)!.push(row)
    }

    const pointsPerQuestion = {
      single_choice: Number((ex as any)?.scoring_config?.points_per_question?.single_choice ?? 0),
      true_false: Number((ex as any)?.scoring_config?.points_per_question?.true_false ?? 0),
      short_answer: Number((ex as any)?.scoring_config?.points_per_question?.short_answer ?? 0),
    }

    const newQuestions: any[] = []
    const mapOldToNew = new Map<string, string>()

    for (const row of gq) {
      const q = qMap.get(row.question_id)
      if (!q) return NextResponse.json({ error: 'Question not found in bank' }, { status: 500 })
      const qt = String(q.question_type || '')
      const points =
        qt === 'single_choice' ? pointsPerQuestion.single_choice :
        qt === 'true_false_group' ? pointsPerQuestion.true_false :
        qt === 'short_answer' ? pointsPerQuestion.short_answer :
        0

      newQuestions.push({
        lesson_id: lessonId,
        content: q.content,
        question_type: q.question_type,
        difficulty: q.difficulty ?? null,
        difficulty_academic: q.difficulty_academic ?? null,
        topic_unit: q.topic_unit ?? null,
        topic: q.topic ?? null,
        image_url: q.image_url ?? null,
        image_alt: q.image_alt ?? null,
        image_caption: q.image_caption ?? null,
        brief_explanation: q.brief_explanation ?? null,
        tip: q.tip ?? null,
        explanation: q.explanation ?? null,
        order_index: row.order_index,
        exam_score: points
      })
    }

    const { data: insertedQs, error: insQErr } = await svc
      .from('questions')
      .insert(newQuestions)
      .select('id')
    if (insQErr) return NextResponse.json({ error: insQErr.message }, { status: 500 })

    for (let i = 0; i < gq.length; i++) {
      mapOldToNew.set(gq[i].question_id, insertedQs?.[i]?.id)
    }

    const optionInserts: any[] = []
    const statementInserts: any[] = []
    const shortAnswerInserts: any[] = []

    for (const row of gq) {
      const oldId = row.question_id
      const newId = mapOldToNew.get(oldId)
      if (!newId) continue
      const qt = String(qMap.get(oldId)?.question_type || '')
      const points =
        qt === 'single_choice' ? pointsPerQuestion.single_choice :
        qt === 'true_false_group' ? pointsPerQuestion.true_false :
        qt === 'short_answer' ? pointsPerQuestion.short_answer :
        0

      if (qt === 'single_choice') {
        const opts = optionsByQuestion.get(oldId) || []
        for (const o of opts) {
          optionInserts.push({
            question_id: newId,
            option_key: o.option_key,
            option_text: o.option_text,
            is_correct: o.is_correct === true,
            sort_order: o.sort_order ?? 0
          })
        }
      } else if (qt === 'true_false_group') {
        const st = statementsByQuestion.get(oldId) || []
        const sum = st.reduce((acc, s) => acc + (Number(s.score) || 0), 0)
        const scale = sum > 0 && points > 0 ? (points / sum) : 1
        for (const s of st) {
          statementInserts.push({
            question_id: newId,
            statement_key: s.statement_key,
            statement_text: s.statement_text,
            correct_answer: s.correct_answer === true,
            score: round4((Number(s.score) || 0) * scale),
            sort_order: s.sort_order ?? 0,
            explanation: s.explanation ?? '',
            tip: s.tip ?? ''
          })
        }
      } else if (qt === 'short_answer') {
        const sa = shortAnswersByQuestion.get(oldId) || []
        for (const a of sa) {
          shortAnswerInserts.push({
            question_id: newId,
            answer_text: a.answer_text,
            score: points || a.score || 1,
            explanation: a.explanation ?? '',
            tip: a.tip ?? ''
          })
        }
      }
    }

    if (optionInserts.length) {
      const { error } = await svc.from('question_options').insert(optionInserts)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (statementInserts.length) {
      const { error } = await svc.from('question_statements').insert(statementInserts)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (shortAnswerInserts.length) {
      const { error } = await svc.from('question_short_answers').insert(shortAnswerInserts)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const { error } = await svc
      .from('generated_exams')
      .update({ is_published: true, published_lesson_id: lessonId, published_at: nowIso })
      .eq('id', params.examId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, lesson_id: lessonId })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
