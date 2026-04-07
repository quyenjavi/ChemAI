import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

type QuestionRow = {
  id: string
  lesson_id: string
  question_type: string
  content: string | null
  tip: string | null
  explanation: string | null
  image_url: string | null
  exam_score: number | null
  topic_unit: string | null
  difficulty_academic: string | null
  created_at: string | null
}

export async function GET(_: Request, { params }: { params: { lessonId: string } }) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const svc = serviceRoleClient()
    const { data: teacher } = await svc.from('teacher_profiles').select('id').eq('user_id', user.id).maybeSingle()
    if (!teacher) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: questions, error } = await svc
      .from('questions')
      .select('id,lesson_id,question_type,content,tip,explanation,image_url,exam_score,topic_unit,difficulty_academic,created_at')
      .eq('lesson_id', params.lessonId)
      .order('order_index', { ascending: true, nullsFirst: true } as any)
      .order('created_at', { ascending: true })
      .limit(2000)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const ids = (questions || []).map(q => q.id)
    const [optRes, stmtRes, saRes] = await Promise.all([
      ids.length ? svc.from('question_options').select('id,question_id,option_key,option_text,is_correct,sort_order,image_url,image_alt,image_caption').in('question_id', ids).order('sort_order', { ascending: true }) : Promise.resolve({ data: [] as any[] }),
      ids.length ? svc.from('question_statements').select('id,question_id,statement_key,statement_text,correct_answer,score,sort_order,explanation,tip').in('question_id', ids).order('sort_order', { ascending: true }) : Promise.resolve({ data: [] as any[] }),
      ids.length ? svc.from('question_short_answers').select('id,question_id,answer_text,score,explanation,tip,created_at').in('question_id', ids).order('created_at', { ascending: true }) : Promise.resolve({ data: [] as any[] }),
    ])

    const optionsByQ: Record<string, any[]> = {}
    for (const o of (optRes as any).data || []) {
      const mapped = {
        option_key: o.option_key,
        content: o.option_text,
        is_correct: o.is_correct,
        sort_order: o.sort_order,
        image_url: o.image_url,
        image_alt: o.image_alt,
        image_caption: o.image_caption,
      }
      optionsByQ[o.question_id] = optionsByQ[o.question_id] || []
      optionsByQ[o.question_id].push(mapped)
    }
    const statementsByQ: Record<string, any[]> = {}
    for (const s of (stmtRes as any).data || []) {
      const mapped = {
        statement_id: s.id,
        statement_key: s.statement_key,
        content: s.statement_text,
        correct_answer: s.correct_answer,
        score: s.score,
        sort_order: s.sort_order,
        explanation: s.explanation,
        tip: s.tip,
      }
      statementsByQ[s.question_id] = statementsByQ[s.question_id] || []
      statementsByQ[s.question_id].push(mapped)
    }
    const shortAnswersByQ: Record<string, any[]> = {}
    for (const a of (saRes as any).data || []) {
      const mapped = {
        content: a.answer_text,
        score: a.score,
        explanation: a.explanation,
        tip: a.tip,
      }
      shortAnswersByQ[a.question_id] = shortAnswersByQ[a.question_id] || []
      shortAnswersByQ[a.question_id].push(mapped)
    }

    const items = (questions || []).map((q: QuestionRow) => ({
      ...q,
      options: optionsByQ[q.id] || [],
      statements: statementsByQ[q.id] || [],
      short_answers: shortAnswersByQ[q.id] || [],
    }))

    return NextResponse.json({ questions: items })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
