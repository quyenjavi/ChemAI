import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export async function POST(req: Request, { params }: { params: { questionId: string } }) {
  try {
    const payload = await req.json()
    const { 
      change_type, 
      change_note, 
      ai_generated_tip_explanation, 
      ai_model, 
      ai_prompt_version, 
      question,
      options,
      statements,
      short_answers,
      new_question_id
    } = payload

    if (!change_type || !['keep', 'wrong_answer', 'wrong_question'].includes(change_type)) {
      return NextResponse.json({ error: 'Missing or invalid change type' }, { status: 400 })
    }

    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Check teacher profile
    const { data: teacher } = await supabase.from('teacher_profiles').select('id').eq('user_id', user.id).maybeSingle()
    if (!teacher) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const svc = serviceRoleClient()

    if (change_type === 'keep') {
      const nowIso = new Date().toISOString()
      const { error: qErr } = await svc
        .from('questions')
        .update({
          review_status: 'reviewed_keep',
          report_locked: true,
          last_reviewed_at: nowIso,
          last_review_note: change_note || null
        })
        .eq('id', params.questionId)
      if (qErr) return NextResponse.json({ error: 'Update question failed: ' + qErr.message }, { status: 500 })

      const { error: rErr } = await svc
        .from('question_reports')
        .update({
          status: 'reviewed_keep',
          reviewed_at: nowIso,
          reviewed_by: teacher.id,
          review_note: change_note || null
        })
        .eq('question_id', params.questionId)
        .in('status', ['pending', 'reported'])
      if (rErr) return NextResponse.json({ error: 'Update reports failed: ' + rErr.message }, { status: 500 })

      return NextResponse.json({
        success: true,
        revision_id: null,
        review_status: 'reviewed_keep'
      })
    }

    // Step 1: Get old snapshot
    const { data: snapshot, error: snapshotError } = await svc.rpc('get_question_snapshot', { p_question_id: params.questionId })
    if (snapshotError) return NextResponse.json({ error: 'Failed to take snapshot: ' + snapshotError.message }, { status: 500 })

    // Step 2: Update question and its related parts
    // Update main question
    const { error: qErr } = await svc
      .from('questions')
      .update({
        content: question.content,
        brief_content: question.brief_content,
        tip: question.tip,
        explanation: question.explanation,
        topic: question.topic,
        difficulty: question.difficulty,
        exam_score: question.exam_score,
        image_url: question.image_url,
        image_alt: question.image_alt,
        image_caption: question.image_caption
      })
      .eq('id', params.questionId)

    if (qErr) return NextResponse.json({ error: 'Update question failed: ' + qErr.message }, { status: 500 })

    // Update options if present (single_choice)
    if (Array.isArray(options) && options.length > 0) {
      for (const opt of options) {
        const { error: oErr } = await svc
          .from('question_options')
          .update({
            option_text: opt.option_text,
            is_correct: opt.is_correct,
            sort_order: opt.sort_order,
            image_url: opt.image_url,
            image_alt: opt.image_alt,
            image_caption: opt.image_caption
          })
          .eq('question_id', params.questionId)
          .eq('option_key', opt.option_key)
        if (oErr) return NextResponse.json({ error: 'Update options failed: ' + oErr.message }, { status: 500 })
      }
    }

    // Update statements if present (true_false_group)
    if (Array.isArray(statements) && statements.length > 0) {
      for (const st of statements) {
        const { error: sErr } = await svc
          .from('question_statements')
          .update({
            statement_text: st.statement_text,
            correct_answer: st.correct_answer,
            score: st.score,
            sort_order: st.sort_order,
            explanation: st.explanation,
            tip: st.tip
          })
          .eq('id', st.id)
        if (sErr) return NextResponse.json({ error: 'Update statements failed: ' + sErr.message }, { status: 500 })
      }
    }

    // Update short answers if present
    if (Array.isArray(short_answers) && short_answers.length > 0) {
      // Sync short answers: delete and re-insert
      await svc.from('question_short_answers').delete().eq('question_id', params.questionId)
      const { error: saErr } = await svc.from('question_short_answers').insert(
        short_answers.map((sa: any) => ({
          question_id: params.questionId,
          answer_text: sa.answer_text,
          score: sa.score ?? 1,
          explanation: sa.explanation || '',
          tip: sa.tip || ''
        }))
      )
      if (saErr) return NextResponse.json({ error: 'Update short answers failed: ' + saErr.message }, { status: 500 })
    }

    // Step 3: Source of Truth is the data we just saved (form data)
    
    // Step 4: Call SQL function
    let result: any
    if (change_type === 'wrong_answer') {
      const { data, error } = await svc.rpc('apply_question_review_wrong_answer', {
        p_question_id: params.questionId,
        p_old_question_snapshot: snapshot,
        p_changed_by: teacher.id,
        p_change_note: change_note,
        p_ai_generated_tip_explanation: !!ai_generated_tip_explanation,
        p_ai_model: ai_model || 'gpt-4o-mini',
        p_ai_prompt_version: ai_prompt_version || 'tip_explain_v1'
      })
      if (error) return NextResponse.json({ error: 'Apply wrong answer failed: ' + error.message }, { status: 500 })
      result = data
    } else if (change_type === 'wrong_question') {
      const { data, error } = await svc.rpc('apply_question_review_wrong_question', {
        p_question_id: params.questionId,
        p_old_question_snapshot: snapshot,
        p_changed_by: teacher.id,
        p_change_note: change_note,
        p_ai_generated_tip_explanation: !!ai_generated_tip_explanation,
        p_ai_model: ai_model || 'gpt-4o-mini',
        p_ai_prompt_version: ai_prompt_version || 'tip_explain_v1',
        p_new_question_id: new_question_id || null
      })
      if (error) return NextResponse.json({ error: 'Apply wrong question failed: ' + error.message }, { status: 500 })
      result = data
    }

    // Step 5: Return result
    const { data: qAfter } = await svc
      .from('questions')
      .select('review_status')
      .eq('id', params.questionId)
      .maybeSingle()

    return NextResponse.json({
      success: true,
      revision_id: result?.revision_id || null,
      review_status: qAfter?.review_status || null
    })

  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
