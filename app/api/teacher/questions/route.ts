import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

type SortKey =
  | 'total_attempts'
  | 'correct_rate'
  | 'grade_name'
  | 'lesson_title'
  | 'report_count'
  | 'last_reported_at'

type SortDir = 'asc' | 'desc'

function safeSortKey(value: string | null): SortKey {
  const v = (value || '').trim()
  if (
    v === 'total_attempts' ||
    v === 'correct_rate' ||
    v === 'grade_name' ||
    v === 'lesson_title' ||
    v === 'report_count' ||
    v === 'last_reported_at'
  ) {
    return v
  }
  return 'total_attempts'
}

function safeSortDir(value: string | null): SortDir {
  return value === 'asc' ? 'asc' : 'desc'
}

function escapeLike(value: string) {
  return value.replace(/[%_]/g, '\\$&')
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)

    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10))
    const pageSize = Math.max(1, parseInt(url.searchParams.get('page_size') || '20', 10))
    const sortKey = safeSortKey(url.searchParams.get('sort_key'))
    const sortDir = safeSortDir(url.searchParams.get('sort_dir'))

    const gradeNameFilter = (url.searchParams.get('grade_name') || '').trim()
    const lessonIdFilter = (url.searchParams.get('lesson_id') || '').trim()
    const typeFilter = (url.searchParams.get('question_type') || '').trim()
    const statusFilter = (url.searchParams.get('review_status') || '').trim()
    const search = (url.searchParams.get('search') || '').trim()

    const supabase = createSupabaseServer()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const svc = serviceRoleClient()

    let query = svc
      .from('question_review_summary_v')
      .select(
        `
        question_id,
        lesson_id,
        lesson_title,
        grade_name,
        question_content,
        brief_content,
        question_type,
        topic,
        difficulty,
        order_index,
        exam_score,
        review_status,
        resolution_type,
        report_locked,
        report_count_cached,
        report_count,
        student_report_count,
        pending_report_count,
        first_reported_at,
        last_reported_at,
        last_reviewed_at,
        last_review_note,
        last_reviewed_by,
        active_version_no,
        replaced_by_question_id,
        total_attempts,
        correct_attempts,
        correct_rate
      `,
        { count: 'exact' }
      )

    if (gradeNameFilter) {
      query = query.eq('grade_name', gradeNameFilter)
    }

    if (lessonIdFilter) {
      query = query.eq('lesson_id', lessonIdFilter)
    }

    if (typeFilter) {
      query = query.eq('question_type', typeFilter)
    }

    if (statusFilter === 'reported') {
      query = query.eq('review_status', 'reported')
    } else if (statusFilter === 'processed') {
      query = query.neq('review_status', 'normal').neq('review_status', 'reported')
    } else if (statusFilter === 'not_reported') {
      query = query.eq('report_count', 0)
    }

    if (search) {
      const needle = `%${escapeLike(search)}%`
      query = query.or(
        [
          `question_content.ilike.${needle}`,
          `brief_content.ilike.${needle}`,
          `lesson_title.ilike.${needle}`,
          `grade_name.ilike.${needle}`,
          `topic.ilike.${needle}`,
          `explanation.ilike.${needle}`,
          `brief_explanation.ilike.${needle}`,
          `tip.ilike.${needle}`,
        ].join(',')
      )
    }

    if (sortKey === 'total_attempts') {
      query = query
        .order('total_attempts', { ascending: sortDir === 'asc' })
    } else if (sortKey === 'correct_rate') {
      query = query
        .order('correct_rate', { ascending: sortDir === 'asc' })
    } else if (sortKey === 'grade_name') {
      query = query
        .order('grade_name', { ascending: sortDir === 'asc' })
    } else if (sortKey === 'lesson_title') {
      query = query
        .order('lesson_title', { ascending: sortDir === 'asc' })
    } else if (sortKey === 'report_count') {
      query = query
        .order('report_count', { ascending: sortDir === 'asc' })
        .order('last_reported_at', { ascending: false })
    } else if (sortKey === 'last_reported_at') {
      query = query.order('last_reported_at', { ascending: sortDir === 'asc' })
    }

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    const { data: rowsRaw, error, count } = await query.range(from, to)

    if (error) {
      return NextResponse.json(
        {
          stage: 'question_stats_summary',
          error: error.message,
          details: error,
        },
        { status: 500 }
      )
    }

    const rows = Array.isArray(rowsRaw) ? rowsRaw : []
    const questionIds = rows.map((r: any) => r.question_id).filter(Boolean)

    const singleChoiceIds = rows
      .filter((r: any) => r.question_type === 'single_choice')
      .map((r: any) => r.question_id)

    const trueFalseIds = rows
      .filter((r: any) => r.question_type === 'true_false_group')
      .map((r: any) => r.question_id)

    const shortAnswerIds = rows
      .filter((r: any) => r.question_type === 'short_answer')
      .map((r: any) => r.question_id)

    const { data: optionsRaw, error: optionsError } = singleChoiceIds.length
      ? await svc
          .from('question_options')
          .select('question_id,option_key,option_text,is_correct,sort_order,image_url,image_alt,image_caption')
          .in('question_id', singleChoiceIds)
          .order('sort_order', { ascending: true })
      : { data: [], error: null }

    if (optionsError) {
      return NextResponse.json(
        {
          stage: 'question_options',
          error: optionsError.message,
          details: optionsError,
        },
        { status: 500 }
      )
    }

    const { data: statementsRaw, error: statementsError } = trueFalseIds.length
      ? await svc
          .from('question_statements')
          .select('id,question_id,statement_key,statement_text,correct_answer,sort_order,score,explanation,tip')
          .in('question_id', trueFalseIds)
          .order('sort_order', { ascending: true })
      : { data: [], error: null }

    if (statementsError) {
      return NextResponse.json(
        {
          stage: 'question_statements',
          error: statementsError.message,
          details: statementsError,
        },
        { status: 500 }
      )
    }

    const { data: shortAnswersRaw, error: shortAnswersError } = shortAnswerIds.length
      ? await svc
          .from('question_short_answers')
          .select('question_id,answer_text,score,explanation,tip')
          .in('question_id', shortAnswerIds)
      : { data: [], error: null }

    if (shortAnswersError) {
      return NextResponse.json(
        {
          stage: 'question_short_answers',
          error: shortAnswersError.message,
          details: shortAnswersError,
        },
        { status: 500 }
      )
    }

    const optionsByQuestion = new Map<string, any[]>()
    for (const row of Array.isArray(optionsRaw) ? optionsRaw : []) {
      if (!optionsByQuestion.has(row.question_id)) optionsByQuestion.set(row.question_id, [])
      optionsByQuestion.get(row.question_id)!.push({
        key: row.option_key || '',
        text: row.option_text || '',
        is_correct: row.is_correct === true,
        order: row.sort_order ?? 0,
        image_url: row.image_url || '',
        image_alt: row.image_alt || '',
        image_caption: row.image_caption || '',
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
        order: row.sort_order ?? 0,
        score: row.score ?? 0,
        explanation: row.explanation || '',
        tip: row.tip || '',
      })
    }

    const acceptedAnswersByQuestion = new Map<string, string[]>()
    const shortMetaByQuestion = new Map<string, any[]>()
    for (const row of Array.isArray(shortAnswersRaw) ? shortAnswersRaw : []) {
      if (!acceptedAnswersByQuestion.has(row.question_id)) {
        acceptedAnswersByQuestion.set(row.question_id, [])
      }
      if (!shortMetaByQuestion.has(row.question_id)) {
        shortMetaByQuestion.set(row.question_id, [])
      }
      acceptedAnswersByQuestion.get(row.question_id)!.push(row.answer_text || '')
      shortMetaByQuestion.get(row.question_id)!.push({
        answer_text: row.answer_text || '',
        score: row.score ?? 0,
        explanation: row.explanation || '',
        tip: row.tip || '',
      })
    }

    const payload = rows.map((row: any) => {
      const options = optionsByQuestion.get(row.question_id) || []
      const statements = statementsByQuestion.get(row.question_id) || []
      const acceptedAnswers = acceptedAnswersByQuestion.get(row.question_id) || []
      const shortMeta = shortMetaByQuestion.get(row.question_id) || []

      return {
        question_id: row.question_id,
        lesson_id: row.lesson_id || '',
        lesson_title: row.lesson_title || '',
        grade_name: row.grade_name || '',
        question_content: row.question_content || '',
        brief_content: row.brief_content || '',
        question_type: row.question_type || '',
        topic: row.topic || '',
        difficulty: row.difficulty ?? null,
        order_index: row.order_index ?? null,
        exam_score: row.exam_score ?? null,
        review_status: row.review_status || 'normal',
        resolution_type: row.resolution_type || 'none',
        report_locked: row.report_locked === true,
        report_count_cached: Number(row.report_count_cached || 0),
        report_count: Number(row.report_count || 0),
        student_report_count: Number(row.student_report_count || 0),
        pending_report_count: Number(row.pending_report_count || 0),
        first_reported_at: row.first_reported_at || null,
        last_reported_at: row.last_reported_at || null,
        last_reviewed_at: row.last_reviewed_at || null,
        last_review_note: row.last_review_note || null,
        last_reviewed_by: row.last_reviewed_by || null,
        active_version_no: Number(row.active_version_no || 1),
        replaced_by_question_id: row.replaced_by_question_id || null,
        total_attempts: Number(row.total_attempts || 0),
        correct_attempts: Number(row.correct_attempts || 0),
        correct_rate: Number(row.correct_rate || 0),
        media: [],
        options,
        correct_key: options.find((o: any) => o.is_correct)?.key || '',
        statements,
        statement_count: statements.length,
        accepted_answers: acceptedAnswers,
        short_answer_meta: shortMeta,
      }
    })

    return NextResponse.json({
      questions: payload,
      total: count || 0,
      page,
      page_size: pageSize,
      scope: 'all',
    })
  } catch (e: any) {
    return NextResponse.json(
      {
        error: e?.message || 'Server error',
        details: e,
      },
      { status: 500 }
    )
  }
}