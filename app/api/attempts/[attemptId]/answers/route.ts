import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

const parseSelectedBool = (v: any): boolean | null => {
  if (v === true || v === 'true') return true
  if (v === false || v === 'false') return false
  if (v === 'A') return true
  if (v === 'B') return false
  return null
}

const getStatementCorrect = (row: any): boolean | null => {
  if (typeof row?.is_correct === 'boolean') return row.is_correct
  if (typeof row?.correct_answer === 'boolean') return row.correct_answer
  if (typeof row?.is_true === 'boolean') return row.is_true
  if (typeof row?.correct_value === 'boolean') return row.correct_value
  if (typeof row?.answer === 'boolean') return row.answer
  return null
}

export async function GET(_: Request, { params }: { params: { attemptId: string } }) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    
    const svc = serviceRoleClient()
    
    // 1. Get attempt to verify ownership
    const { data: att, error: attErr } = await svc
      .from('quiz_attempts')
      .select('*, lessons(title, lesson_type)')
      .eq('id', params.attemptId)
      .maybeSingle()
    
    if (attErr) {
      console.error('Error fetching attempt:', attErr)
      return NextResponse.json({ error: attErr.message }, { status: 500 })
    }
    
    if (!att || att.user_id !== user.id) {
      console.log('Attempt not found or unauthorized:', { attemptId: params.attemptId, userId: user.id })
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // 2. Get grading report if available
    const { data: gradingReport } = await svc
      .from('student_quiz_attempt_reports')
      .select('*')
      .eq('attempt_id', params.attemptId)
      .maybeSingle()

    // 2b. Get AI feedback/report content (Dify result) from attempt_reports
    const { data: reportRow } = await svc
      .from('attempt_reports')
      .select('report_content')
      .eq('attempt_id', params.attemptId)
      .maybeSingle()
    let reportContent: any = null
    const rawReport = (reportRow as any)?.report_content
    if (rawReport) {
      if (typeof rawReport === 'object') reportContent = rawReport
      else if (typeof rawReport === 'string') {
        try {
          reportContent = JSON.parse(rawReport)
        } catch {
          reportContent = null
        }
      }
    }

    const finalAttempt = {
      id: att.id,
      lesson_id: att.lesson_id,
      lesson_title: att.lessons?.title || null,
      lesson_type: att.lessons?.lesson_type || null,
      created_at: att.created_at,
      mode: att.mode,
      status: att.status,
      total_questions: att.total_questions,
      correct_answers: att.correct_answers,
      score_percent: att.score_percent,
      raw_score: att.raw_score,
      total_score: att.total_score,
      accuracy_correct_units: gradingReport?.accuracy_correct_units,
      accuracy_total_units: gradingReport?.accuracy_total_units,
      accuracy_percent: gradingReport?.accuracy_percent,
    }

    // 2. Get all answers from quiz_attempt_answers (SOURCE OF TRUTH)
    const { data: answerRows, error: ansErr } = await svc
      .from('quiz_attempt_answers')
      .select('*')
      .eq('attempt_id', params.attemptId)
    
    if (ansErr) throw ansErr
    if (!answerRows || answerRows.length === 0) {
      console.log('No answers found in quiz_attempt_answers for attempt:', params.attemptId)
      return NextResponse.json({ attempt: finalAttempt, report: reportContent, answers: [] })
    }

    // 3. Get unique question IDs
    const qIds = Array.from(new Set(answerRows.map((r: any) => r.question_id).filter(Boolean)))
    
    // 4. Get question metadata
    const { data: qs } = await svc
      .from('questions')
      .select('id, content, question_type, order_index, topic, brief_explanation, explanation, tip, image_url, image_alt, image_caption, report_locked, review_status, resolution_type')
      .in('id', qIds)
    const qById: Record<string, any> = Object.fromEntries((qs || []).map((q: any) => [q.id, q]))

    // 5. Get reports for these questions in this attempt
    const { data: reports } = await svc
      .from('question_reports')
      .select('id, question_id, status, report_reason, report_detail, reviewed_at, review_note')
      .eq('attempt_id', params.attemptId)
    const reportByQ: Record<string, any> = Object.fromEntries((reports || []).map((r: any) => [r.question_id, r]))

    // 6. Define sort order and sort questions
    const typeOrder: { [key: string]: number } = {
      'single_choice': 1,
      'true_false': 2,
      'short_answer': 3,
    };

    const orderedQuestions = qIds
      .map((id) => qById[id])
      .filter(Boolean)
      .sort((a: any, b: any) => {
        const typeA = typeOrder[a.question_type as string] || 99
        const typeB = typeOrder[b.question_type as string] || 99
        if (typeA !== typeB) return typeA - typeB
        return (a.order_index ?? 0) - (b.order_index ?? 0)
      })

    const choiceIds = orderedQuestions.filter((q: any) => q.question_type === 'single_choice' || q.question_type === 'true_false').map((q: any) => q.id)
    const tfGroupIds = orderedQuestions.filter((q: any) => q.question_type === 'true_false_group').map((q: any) => q.id)
    const saIds = orderedQuestions.filter((q: any) => q.question_type === 'short_answer').map((q: any) => q.id)

    // 7. Fetch details for each type
    let optionsByQ: Record<string, any[]> = {}
    if (choiceIds.length) {
      const { data: opts } = await svc
        .from('question_options')
        .select('*')
        .in('question_id', choiceIds)
        .order('sort_order', { ascending: true })
      for (const o of (opts || []) as any[]) {
        optionsByQ[o.question_id] = optionsByQ[o.question_id] || []
        optionsByQ[o.question_id].push({ key: o.option_key, text: o.option_text, is_correct: !!o.is_correct })
      }
    }

    let statementsByQ: Record<string, any[]> = {}
    if (tfGroupIds.length) {
      const { data: st } = await svc
        .from('question_statements')
        .select('*')
        .in('question_id', tfGroupIds)
        .order('sort_order', { ascending: true })
      for (const s of (st || []) as any[]) {
        statementsByQ[s.question_id] = statementsByQ[s.question_id] || []
        statementsByQ[s.question_id].push(s)
      }
    }

    let saByQ: Record<string, any[]> = {}
    if (saIds.length) {
      const { data: sa } = await svc
        .from('question_short_answers')
        .select('*')
        .in('question_id', saIds)
      for (const s of (sa || []) as any[]) {
        saByQ[s.question_id] = saByQ[s.question_id] || []
        saByQ[s.question_id].push(s)
      }
    }

    // 8. Map everything together
    const rowsByQ: Record<string, any[]> = {}
    for (const r of answerRows) {
      rowsByQ[r.question_id] = rowsByQ[r.question_id] || []
      rowsByQ[r.question_id].push(r)
    }

    const payload = orderedQuestions.map((q: any) => {
      const qid = q.id as string
      const typ = q.question_type as string
      const aRows = rowsByQ[qid] || []
      const report = reportByQ[qid]
      
      const base = {
        question_id: qid,
        attempt_id: params.attemptId,
        content: q.content || '',
        question_type: typ,
        order_index: q.order_index ?? 0,
        topic: q.topic || '',
        explanation: q.brief_explanation || q.explanation || '',
        tip: q.tip || '',
        image_url: q.image_url || '',
        image_alt: q.image_alt || '',
        image_caption: q.image_caption || '',
        report_locked: q.report_locked || false,
        review_status: q.review_status || 'normal',
        resolution_type: q.resolution_type || 'none',
        report_id: report?.id || null,
        report_status: report?.status || null,
        report_reason: report?.report_reason || null,
        report_detail: report?.report_detail || null,
        reviewed_at: report?.reviewed_at || null,
        review_note: report?.review_note || null
      }

      if (typ === 'true_false' || typ === 'true_false_group') {
        const st = statementsByQ[qid] || []
        const byStId: Record<string, any> = Object.fromEntries(aRows.filter(x => x.statement_id).map(x => [x.statement_id, x]))
        
        let totalScore = 0
        let awardedScore = 0
        let allCorrect = true
        let hasAdjustment = false
        let adjType = null
        let adjNote = null

        const statements = st.map((s: any) => {
          const ar = byStId[s.id]
          const selected = parseSelectedBool(ar?.selected_answer)
          
          totalScore += ar?.max_score ?? s.score ?? 0.25
          awardedScore += ar?.score_awarded ?? 0
          if (ar?.is_correct === false) allCorrect = false
          if (ar?.review_adjustment_type && ar.review_adjustment_type !== 'none') {
            hasAdjustment = true
            adjType = ar.review_adjustment_type
            adjNote = ar.review_adjustment_note
          }

          return {
            answer_id: ar?.id || null,
            statement_id: s.id,
            text: s.statement_text || '',
            sort_order: s.sort_order ?? 0,
            selected_answer: selected,
            is_correct: typeof ar?.is_correct === 'boolean' ? ar.is_correct : null,
            correct_answer: getStatementCorrect(s),
            score_awarded: ar?.score_awarded ?? null,
            max_score: ar?.max_score ?? null,
            review_adjustment_type: ar?.review_adjustment_type || null,
            review_adjustment_note: ar?.review_adjustment_note || null,
            review_adjusted_at: ar?.review_adjusted_at || null,
            explanation: s.explanation || s.brief_explanation || '',
            tip: s.tip || ''
          }
        })

        return { 
          ...base, 
          statements,
          is_correct: allCorrect,
          score_awarded: awardedScore,
          max_score: totalScore,
          review_adjustment_type: adjType,
          review_adjustment_note: adjNote,
          answer_id: statements[0]?.answer_id || null
        }
      }

      if (typ === 'short_answer') {
        const ar = aRows[0]
        const saList = saByQ[qid] || []
        return {
          ...base,
          answer_id: ar?.id || null,
          answer_text: ar?.answer_text ?? null,
          is_correct: typeof ar?.is_correct === 'boolean' ? ar.is_correct : null,
          score_awarded: ar?.score_awarded ?? null,
          max_score: ar?.max_score ?? null,
          review_adjustment_type: ar?.review_adjustment_type || null,
          review_adjustment_note: ar?.review_adjustment_note || null,
          review_adjusted_at: ar?.review_adjusted_at || null,
          reference_answers: saList.map(sa => sa.answer_text).filter(Boolean),
          tip: base.tip || saList[0]?.tip || ''
        }
      }

      if (typ === 'single_choice') {
        const ar = aRows[0]
        const options = optionsByQ[qid] || []
        const correct = options.find(o => o.is_correct)
        const selectedKey = (ar?.selected_answer || null) as string | null
        const selectedText = selectedKey ? (options.find(o => o.key === selectedKey)?.text || null) : null
        return {
          ...base,
          answer_id: ar?.id || null,
          selected_answer: selectedKey,
          selected_text: selectedText,
          correct_key: correct?.key || null,
          correct_text: correct?.text || null,
          is_correct: typeof ar?.is_correct === 'boolean' ? ar.is_correct : null,
          score_awarded: ar?.score_awarded ?? null,
          max_score: ar?.max_score ?? null,
          review_adjustment_type: ar?.review_adjustment_type || null,
          review_adjustment_note: ar?.review_adjustment_note || null,
          review_adjusted_at: ar?.review_adjusted_at || null
        }
      }

      // Default fallback
      const ar = aRows[0]
      return {
        ...base,
        selected_answer: ar?.selected_answer ?? null,
        answer_text: ar?.answer_text ?? null,
        is_correct: typeof ar?.is_correct === 'boolean' ? ar.is_correct : null,
        score_awarded: ar?.score_awarded ?? null,
        max_score: ar?.max_score ?? null,
        review_adjustment_type: ar?.review_adjustment_type || null,
        review_adjustment_note: ar?.review_adjustment_note || null,
        review_adjusted_at: ar?.review_adjusted_at || null
      }
    })

    const finalPayload = {
      attempt: {
        id: att.id,
        lesson_id: att.lesson_id,
        lesson_title: att.lessons?.title || null,
        lesson_type: att.lessons?.lesson_type || null,
        created_at: att.created_at,
        mode: att.mode,
        status: att.status,
        total_questions: att.total_questions,
        correct_answers: att.correct_answers,
        score_percent: att.score_percent,
        raw_score: att.raw_score,
        total_score: att.total_score,
        accuracy_correct_units: gradingReport?.accuracy_correct_units,
        accuracy_total_units: gradingReport?.accuracy_total_units,
        accuracy_percent: gradingReport?.accuracy_percent,
      },
      report: reportContent,
      answers: payload,
    }

    return NextResponse.json(finalPayload)
  } catch (e: any) {
    console.error('Error in answers route:', e)
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
