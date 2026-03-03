import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'
import { env } from '@/lib/env'

type SubmitBody = {
  attemptId: string,
  answers: { questionId: string, chosenOption: 'A'|'B'|'C'|'D' }[]
}

async function callDifyWorkflow(payload: any) {
  const res = await fetch(`${env.difyBaseUrl}/workflows/run`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.difyWorkflowKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Dify workflow error: ${res.status} ${txt}`)
  }
  return res.json()
}

function normalizeFeedback(output: any) {
  // Support multiple shapes:
  // - { outputs: { feedback: {...} } }
  // - { feedback: {...} }
  // - {...} directly is feedback
  let candidate = output
  if (candidate && typeof candidate === 'object' && candidate.outputs && candidate.outputs.feedback) {
    candidate = candidate.outputs.feedback
  } else if (candidate && typeof candidate === 'object' && candidate.feedback) {
    candidate = candidate.feedback
  }
  let fb = candidate ?? {}
  if (fb && typeof fb === 'object' && fb.type === 'object' && fb.properties && typeof fb.properties === 'object') {
    fb = fb.properties
  }
  return {
    praise: typeof fb.praise === 'string' ? fb.praise : '',
    strengths: Array.isArray(fb.strengths) ? fb.strengths : [],
    mistakes: Array.isArray(fb.mistakes) ? fb.mistakes : [],
    plan: Array.isArray(fb.plan) ? fb.plan : []
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const body = await request.json() as SubmitBody
    if (!body.attemptId || !Array.isArray(body.answers)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }
    const svc = serviceRoleClient()
    const { data: attempt, error: attemptErr } = await svc.from('quiz_attempts').select('id,user_id,lesson_id').eq('id', body.attemptId).single()
    if (attemptErr || !attempt || attempt.user_id !== user.id) {
      return NextResponse.json({ error: 'Attempt not found' }, { status: 404 })
    }
    // fetch questions
    const ids = body.answers.map(a => a.questionId)
    const { data: questions, error: qErr } = await svc
      .from('questions')
      .select('id, content, brief_content, choice_a, choice_b, choice_c, choice_d, correct_answer, explanation, brief_explanation, topic')
      .in('id', ids)
    if (qErr) {
      return NextResponse.json({ error: qErr.message }, { status: 400 })
    }
    const answerRows = body.answers.map(a => {
      const q = questions?.find(x => x.id === a.questionId)
      const is_correct = q ? (q.correct_answer?.toUpperCase() === a.chosenOption.toUpperCase()) : false
      return {
        attempt_id: body.attemptId,
        question_id: a.questionId,
        selected_answer: a.chosenOption,
        is_correct
      }
    })
    // upsert answers
    const { error: insErr } = await svc
      .from('quiz_attempt_answers')
      .upsert(answerRows, { onConflict: 'attempt_id,question_id' })
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 400 })
    }
    const total = answerRows.length
    const correct = answerRows.filter(r => r.is_correct).length
    const score_percent = total ? Math.round((correct / total) * 100) : 0
    await svc.from('quiz_attempts').update({
      total_questions: total,
      correct_answers: correct,
      score_percent
    }).eq('id', body.attemptId)

    // Build Dify payload
    const { data: lesson } = await svc.from('lessons').select('id, title, grade_id').eq('id', attempt.lesson_id).single()
    const { data: grade } = await svc.from('grades').select('id, name').eq('id', lesson?.grade_id).single()
    const { data: profile } = await svc.from('student_profiles').select('full_name').eq('user_id', user.id).single()

    // Build strings for Dify inputs to match provided workflow schema
    const numbered = (arr: any[]) => arr.map((_, i) => `${i + 1})`).join('')
    const correctLines: string[] = []
    const wrongLines: string[] = []
    answerRows.forEach((r, i) => {
      const idx = i + 1
      const q = questions?.find(x => x.id === r.question_id)
      const chosenText =
        r.selected_answer === 'A' ? q?.choice_a :
        r.selected_answer === 'B' ? q?.choice_b :
        r.selected_answer === 'C' ? q?.choice_c :
        r.selected_answer === 'D' ? q?.choice_d : ''
      const correctText =
        q?.correct_answer === 'A' ? q?.choice_a :
        q?.correct_answer === 'B' ? q?.choice_b :
        q?.correct_answer === 'C' ? q?.choice_c :
        q?.correct_answer === 'D' ? q?.choice_d : ''
      const line = `${idx}) ${q?.content || ''} | Your answer: ${chosenText || ''} | Correct: ${correctText || ''}`
      if (r.is_correct) {
        correctLines.push(line)
      } else {
        wrongLines.push(`\n${idx}) Question: ${q?.content || ''}\n Học sinh đã chọn: ${chosenText || ''}\n Correct answer: ${correctText || ''}`)
      }
    })
    const correct_by_topic_str = correctLines.join('\n')
    const wrong_list_str = wrongLines.join('')

    const difyPayload = {
      inputs: {
        student_name: profile?.full_name || '',
        grade: grade?.name || '',
        lesson_title: lesson?.title || '',
        score: correct,
        total,
        correct_by_topic: correct_by_topic_str,
        wrong_list: wrong_list_str
      },
      response_mode: 'blocking',
      user: user.id
    }

    let normalized: any = null
    try {
      const difyRes = await callDifyWorkflow(difyPayload)
      normalized = normalizeFeedback(difyRes?.data ?? difyRes)
    } catch (e) {
      // swallow dify error, continue returning attempt id
    }
    // upsert attempt_reports
    if (normalized) {
      const { error: repErr } = await svc.from('attempt_reports').upsert({
        attempt_id: body.attemptId,
        user_id: user.id,
        report_content: JSON.stringify({ feedback: normalized })
      }, { onConflict: 'attempt_id' })
      if (repErr) {
        return NextResponse.json({ attemptId: body.attemptId, warning: repErr.message })
      }
    }

    return NextResponse.json({ attemptId: body.attemptId })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
