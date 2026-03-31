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

    const { data: exam } = await svc
      .from('exams')
      .select('id,title,description,grade_id,created_by,status,total_questions')
      .eq('id', params.examId)
      .maybeSingle()
    if (!exam || exam.created_by !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (exam.status === 'published') return NextResponse.json({ error: 'Exam already published' }, { status: 400 })
    if (exam.status !== 'saved') return NextResponse.json({ error: 'Exam must be saved before publish' }, { status: 400 })

    const { data: eqs, error: eqErr } = await svc
      .from('exam_questions')
      .select('id,question_id,question_order,points')
      .eq('exam_id', params.examId)
      .order('question_order', { ascending: true })
    if (eqErr) return NextResponse.json({ error: eqErr.message }, { status: 500 })
    if (!eqs?.length) return NextResponse.json({ error: 'Exam has no questions' }, { status: 400 })

    const nowIso = new Date().toISOString()
    const { data: lessonRow, error: lessonErr } = await svc
      .from('lessons')
      .insert({
        grade_id: exam.grade_id,
        title: exam.title,
        description: exam.description || null,
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
    const qIds = eqs.map((r: any) => r.question_id)
    const { data: qs, error: qErr } = await svc
      .from('questions')
      .select('id,content,question_type,difficulty,topic,image_url,image_alt,image_caption,brief_explanation,tip,explanation')
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

    const newQuestions: any[] = []
    const mapOldToNew = new Map<string, string>()

    for (const eq of eqs) {
      const q = qMap.get(eq.question_id)
      if (!q) return NextResponse.json({ error: 'Question not found in bank' }, { status: 500 })
      newQuestions.push({
        lesson_id: lessonId,
        content: q.content,
        question_type: q.question_type,
        difficulty: q.difficulty ?? null,
        topic: q.topic ?? null,
        image_url: q.image_url ?? null,
        image_alt: q.image_alt ?? null,
        image_caption: q.image_caption ?? null,
        brief_explanation: q.brief_explanation ?? null,
        tip: q.tip ?? null,
        explanation: q.explanation ?? null,
        order_index: eq.question_order,
        exam_score: eq.points
      })
    }

    const { data: insertedQs, error: insQErr } = await svc
      .from('questions')
      .insert(newQuestions)
      .select('id')
    if (insQErr) return NextResponse.json({ error: insQErr.message }, { status: 500 })

    for (let i = 0; i < eqs.length; i++) {
      mapOldToNew.set(eqs[i].question_id, insertedQs?.[i]?.id)
    }

    const optionInserts: any[] = []
    const statementInserts: any[] = []
    const shortAnswerInserts: any[] = []

    for (const eq of eqs) {
      const oldId = eq.question_id
      const newId = mapOldToNew.get(oldId)
      if (!newId) continue
      const qt = String(qMap.get(oldId)?.question_type || '')
      const points = Number(eq.points || 0)

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
      } else if (qt === 'true_false') {
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

    const { error: upExamErr } = await svc
      .from('exams')
      .update({ status: 'published', published_at: nowIso, updated_at: nowIso })
      .eq('id', params.examId)
    if (upExamErr) return NextResponse.json({ error: upExamErr.message }, { status: 500 })

    return NextResponse.json({ ok: true, lesson_id: lessonId })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
