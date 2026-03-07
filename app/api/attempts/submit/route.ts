import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'
import { env } from '@/lib/env'

type AnswerPayload = {
  questionId: string
  selected_answer?: string
  answer_text?: string
}

export async function POST(request: Request) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await request.json()
    const attemptId = body.attemptId as string | undefined
    const answers = (body.answers || []) as AnswerPayload[]
    if (!attemptId || !Array.isArray(answers)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }
    const svc = serviceRoleClient()
    const { data: attempt } = await svc.from('quiz_attempts').select('id,user_id,lesson_id').eq('id', attemptId).maybeSingle()
    if (!attempt || attempt.user_id !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const uid = user.id as string
    const qIds = Array.from(new Set(answers.map(a => a.questionId).filter(Boolean)))
    const { data: qRows } = await svc.from('questions').select('id,question_type,content,brief_content,order_index,topic,explanation,brief_explanation').in('id', qIds)
    const typeById: Record<string, string> = Object.fromEntries((qRows || []).map((q: any) => [q.id, q.question_type]))
    const contentById: Record<string, string> = Object.fromEntries((qRows || []).map((q: any) => [q.id, q.content]))
    const orderById: Record<string, number> = Object.fromEntries((qRows || []).map((q: any) => [q.id, q.order_index ?? 0]))
    const briefContentById: Record<string, string> = Object.fromEntries((qRows || []).map((q: any) => [q.id, q.brief_content || '']))
    const topicById: Record<string, string> = Object.fromEntries((qRows || []).map((q: any) => [q.id, q.topic || '']))
    const explainById: Record<string, string> = Object.fromEntries((qRows || []).map((q: any) => [q.id, q.brief_explanation || q.explanation || '']))
    // load correct options for choice questions
    const choiceIds = qIds.filter(id => ['single_choice', 'true_false'].includes(typeById[id]))
    let correctById: Record<string, string> = {}
    let textByQKey: Record<string, Record<string, string>> = {}
    let correctTextById: Record<string, string> = {}
    if (choiceIds.length) {
      const { data: opts } = await svc
        .from('question_options')
        .select('question_id, option_key, option_text, is_correct')
        .in('question_id', choiceIds)
      for (const o of (opts || []) as any[]) {
        const m = textByQKey[o.question_id] || {}
        m[o.option_key] = o.option_text
        textByQKey[o.question_id] = m
        if (o.is_correct) {
          correctById[o.question_id] = o.option_key
          correctTextById[o.question_id] = o.option_text
        }
      }
    }
    // insert objective answers (skip short_answer here)
    for (const a of answers) {
      const typ = typeById[a.questionId]
      if (typ !== 'short_answer') {
        const chosen = a.selected_answer || ''
        const is_correct = !!(chosen && correctById[a.questionId] && correctById[a.questionId] === chosen)
        await svc.from('quiz_attempt_answers').insert({
          attempt_id: attemptId,
          question_id: a.questionId,
          selected_answer: chosen,
          is_correct,
          created_at: new Date()
        })
      }
    }
    // build wrong_list for choice questions
    const wrong_list = answers.filter(a => {
      const typ = typeById[a.questionId]
      if (typ === 'short_answer') return false
      const chosen = a.selected_answer || ''
      return chosen && correctById[a.questionId] && correctById[a.questionId] !== chosen
    }).map(a => {
      const qid = a.questionId
      const brief = briefContentById[qid] || contentById[qid] || ''
      const chosenText = textByQKey[qid]?.[a.selected_answer || ''] || (a.selected_answer || '')
      const correctText = correctTextById[qid] || (correctById[qid] || '')
      const exp = explainById[qid] || ''
      return `- Câu: ${brief} | Em chọn: ${chosenText} | Đáp án đúng: ${correctText} | Giải thích: ${exp}`
    }).join('\n')
    // compute objective-only score/total for workflow input
    const objectiveIds = qIds.filter(id => typeById[id] === 'single_choice' || typeById[id] === 'true_false')
    const totalObjective = objectiveIds.length
    let correctObjective = 0
    const topicCorrectCounter: Record<string, number> = {}
    for (const a of answers) {
      const typ = typeById[a.questionId]
      if (typ === 'short_answer') continue
      const chosen = a.selected_answer || ''
      if (chosen && correctById[a.questionId] && correctById[a.questionId] === chosen) {
        correctObjective += 1
        const tp = topicById[a.questionId] || ''
        if (tp) topicCorrectCounter[tp] = (topicCorrectCounter[tp] || 0) + 1
      }
    }
    const score_percent = totalObjective ? Math.round((correctObjective / totalObjective) * 100) : 0
    // build essay string from short_answer questions
    const saIds = qIds.filter(id => typeById[id] === 'short_answer')
    let refById: Record<string, string> = {}
    if (saIds.length) {
      const { data: refs } = await svc
        .from('question_short_answers')
        .select('question_id, answer_text')
        .in('question_id', saIds)
      const grouped: Record<string, string[]> = {}
      for (const r of (refs || []) as any[]) {
        grouped[r.question_id] = grouped[r.question_id] || []
        grouped[r.question_id].push(r.answer_text || '')
      }
      for (const k of Object.keys(grouped)) {
        refById[k] = grouped[k].filter(Boolean).join('; ')
      }
    }
    const saEntries = answers.filter(a => typeById[a.questionId] === 'short_answer')
      .map(a => ({
        id: a.questionId,
        order: orderById[a.questionId] ?? 0,
        content: contentById[a.questionId] || '',
        ref: refById[a.questionId] || '',
        student: a.answer_text || ''
      }))
      .sort((x, y) => x.order - y.order)
    const essay = saEntries.length ? saEntries.map((e, idx) =>
      `[Câu ${idx + 1}]\nNội dung: ${e.content}\nĐáp án gợi ý: ${e.ref}\nCâu trả lời học sinh: ${e.student}`
    ).join('\n\n') : ''
    // enrich inputs for workflow
    const { data: profile } = await svc.from('student_profiles').select('full_name, grade_id').eq('user_id', uid).maybeSingle()
    const { data: gradeRow } = profile?.grade_id ? await svc.from('grades').select('name').eq('id', profile.grade_id).maybeSingle() : { data: null }
    const { data: lessonRow } = await svc.from('lessons').select('title').eq('id', attempt.lesson_id).maybeSingle()
    async function callDifyWorkflow(inputs: any) {
      const res = await fetch(`${env.difyBaseUrl}/workflows/run`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.difyWorkflowKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          inputs,
          response_mode: 'blocking',
          user: uid
        })
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Dify workflow error: ${res.status} ${text}`)
      }
      return res.json()
    }
    const correct_by_topic = Object.keys(topicCorrectCounter).map(tp => `${tp}: ${topicCorrectCounter[tp]} câu đúng`).join('; ')
    const wfInputs = {
      student_name: profile?.full_name || '',
      grade: gradeRow?.name || '',
      lesson_title: lessonRow?.title || '',
      score: correctObjective,
      total: totalObjective,
      correct_by_topic,
      wrong_list,
      essay
    }
    let final_correct = correctObjective
    let final_total = totalObjective
    let final_accuracy = totalObjective ? Math.round((correctObjective / totalObjective) * 100) : 0
    let report_json: any = null
    if (!env.difyWorkflowKey || !env.difyBaseUrl) {
      report_json = { error: 'missing_dify_env', ...wfInputs }
    } else {
      try {
        const wfRes = await callDifyWorkflow(wfInputs)
        const data = wfRes?.data || wfRes
        report_json = data
        const f = data?.outputs?.feedback || data?.feedback || null
        if (f?.final_correct != null) final_correct = Number(f.final_correct) || final_correct
        if (f?.final_total != null) final_total = Number(f.final_total) || final_total
        if (f?.final_accuracy != null) {
          const raw = f.final_accuracy
          const parsed = typeof raw === 'string' ? parseFloat(String(raw).replace('%','').trim()) : Number(raw)
          if (isFinite(parsed)) final_accuracy = parsed
        }
      } catch (err) {
        report_json = { error: (err as any)?.message || 'workflow_failed', ...wfInputs }
      }
    }
    // persist attempt summary using final_* fields
    await svc.from('quiz_attempts')
      .update({ total_questions: final_total, correct_answers: final_correct, score_percent: final_accuracy })
      .eq('id', attemptId)
    // save full workflow json to attempt_reports
    await svc.from('attempt_reports')
      .upsert({ attempt_id: attemptId, user_id: uid, report_content: JSON.stringify(report_json) }, { onConflict: 'attempt_id' })
    // insert essay mistakes into mistakes table if workflow returns them
    const mistakesArr = ((report_json?.outputs?.feedback?.mistakes) || (report_json?.mistakes) || []) as Array<{ brief_question: string, chosen: string, correct: string, explain?: string, tip?: string }>
    if (Array.isArray(mistakesArr) && mistakesArr.length) {
      const briefToId: Record<string, string> = {}
      for (const [qid, brief] of Object.entries(briefContentById)) {
        if (brief) briefToId[brief] = qid
      }
      for (const mk of mistakesArr) {
        const qid = briefToId[mk.brief_question] || Object.entries(contentById).find(([, c]) => (c || '') === mk.brief_question)?.[0] || null
        await svc.from('mistakes').insert({
          attempt_id: attemptId,
          question_id: qid,
          brief_question: mk.brief_question,
          chosen_answer: mk.chosen,
          correct_answer: mk.correct,
          explanation: mk.explain || '',
          tip: mk.tip || '',
          created_at: new Date()
        })
      }
    }
    return NextResponse.json({ attemptId })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
