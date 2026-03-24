import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export async function GET(_: Request, { params }: { params: { questionId: string } }) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const svc = serviceRoleClient()

    // 1. Get core question data with lesson and grade info
    const { data: question, error: qErr } = await svc
      .from('questions')
      .select(`
        *,
        lessons (
          id,
          title,
          grade_id,
          grades (
            id,
            name
          )
        )
      `)
      .eq('id', params.questionId)
      .maybeSingle()

    if (qErr || !question) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 })
    }

    // 2. Get stats from question_stats_summary (fallback for grade name if needed)
    const { data: stats } = await svc
      .from('question_stats_summary')
      .select('*')
      .eq('question_id', params.questionId)
      .maybeSingle()

    // 3. Get options (for single_choice)
    const { data: optionsRaw } = await svc
      .from('question_options')
      .select('*')
      .eq('question_id', params.questionId)
      .order('sort_order', { ascending: true })

    // 4. Get statements (for true_false)
    const { data: statementsRaw } = await svc
      .from('question_statements')
      .select('*')
      .eq('question_id', params.questionId)
      .order('sort_order', { ascending: true })

    // 5. Get short answers
    const { data: shortAnswersRaw } = await svc
      .from('question_short_answers')
      .select('*')
      .eq('question_id', params.questionId)

    // 6. Get reports
    const { data: reportsRaw } = await svc
      .from('question_reports')
      .select('*')
      .eq('question_id', params.questionId)
      .order('created_at', { ascending: false })

    // 7. Map payload with normalized fields
    const lessonTitle = question.lessons?.title || stats?.lesson_title || '—'
    const gradeName = question.lessons?.grades?.name || stats?.grade_name || '—'

    // Prioritize report count: 
    // 1. If backend has more reports than question.report_count, use reportsRaw.length
    // 2. Fallback to question.report_count
    const reportCount = Math.max(question.report_count || 0, (reportsRaw || []).length)

    const payload = {
      question: {
        id: question.id,
        lesson_id: question.lesson_id,
        lesson_title: lessonTitle,
        grade_id: question.lessons?.grade_id || null,
        grade_name: gradeName,
        content: question.content,
        brief_content: question.brief_content,
        question_type: question.question_type,
        topic: question.topic,
        difficulty: question.difficulty,
        exam_score: question.exam_score,
        tip: question.tip,
        explanation: question.explanation,
        review_status: question.review_status || 'normal',
        resolution_type: question.resolution_type || 'none',
        report_locked: !!question.report_locked,
        report_count: reportCount,
        last_reported_at: question.last_reported_at,
        last_reviewed_at: question.last_reviewed_at,
        last_review_note: question.last_review_note
      },
      stats: {
        total_attempts: Number(stats?.total_attempts || 0),
        correct_attempts: Number(stats?.correct_attempts || 0),
        correct_rate: Number(stats?.correct_rate || 0)
      },
      options: (optionsRaw || []).map(o => ({
        id: o.id,
        option_key: o.option_key,
        option_text: o.option_text,
        is_correct: !!o.is_correct,
        sort_order: o.sort_order,
        image_url: o.image_url,
        image_alt: o.image_alt,
        image_caption: o.image_caption
      })),
      statements: (statementsRaw || []).map(s => ({
        id: s.id,
        statement_key: s.statement_key,
        statement_text: s.statement_text,
        correct_answer: !!s.correct_answer,
        score: s.score || 0.25,
        sort_order: s.sort_order,
        explanation: s.explanation,
        tip: s.tip
      })),
      short_answers: (shortAnswersRaw || []).map(sa => ({
        id: sa.id,
        answer_text: sa.answer_text,
        score: sa.score || 1,
        explanation: sa.explanation,
        tip: sa.tip
      })),
      reports: (reportsRaw || []).map(r => ({
        id: r.id,
        student_id: r.student_id,
        attempt_id: r.attempt_id,
        attempt_answer_id: r.attempt_answer_id,
        report_reason: r.report_reason,
        report_detail: r.report_detail,
        status: r.status,
        created_at: r.created_at,
        reviewed_at: r.reviewed_at,
        reviewed_by: r.reviewed_by,
        review_note: r.review_note
      }))
    }

    return NextResponse.json(payload)
  } catch (e: any) {
    console.error('API Detail Error:', e)
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
