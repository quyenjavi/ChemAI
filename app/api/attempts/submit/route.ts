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
      return `- Câu: ${brief} | Em chọn ${chosenText} | Đáp án ${correctText}`
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
      score: String(correctObjective),
      total: String(totalObjective),
      correct_by_topic: correct_by_topic || '',
      wrong_list: wrong_list || '',
      essay: ''
    }
    if (essay && typeof essay === 'string') {
      wfInputs.essay = essay
    }
    try {
      const { student_name, grade, lesson_title, score, total, correct_by_topic, wrong_list, essay } = wfInputs
      console.log("DIFY INPUT:", JSON.stringify({
        student_name,
        grade,
        lesson_title,
        score,
        total,
        correct_by_topic,
        wrong_list,
        essay
      }, null, 2))
    } catch {}
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
        const unwrap = (v: any) => (v && typeof v === 'object' && 'value' in v) ? v.value : v
        const f = data?.outputs?.feedback || data?.feedback || null
        const fc = unwrap(f?.final_correct)
        const ft = unwrap(f?.final_total)
        const fa = unwrap(f?.final_accuracy)
        if (fc != null) final_correct = Number(fc) || final_correct
        if (ft != null) final_total = Number(ft) || final_total
        if (fa != null) {
          const parsed = typeof fa === 'string' ? parseFloat(String(fa).replace('%','').trim()) : Number(fa)
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
    const unwrap = (v: any) => (v && typeof v === 'object' && 'value' in v) ? v.value : v
    const arrMistakes = ((report_json?.outputs?.feedback?.mistakes) || (report_json?.mistakes) || [])
    const mistakesArr = (Array.isArray(arrMistakes) ? arrMistakes : []) as Array<any>
    if (Array.isArray(mistakesArr) && mistakesArr.length) {
      const briefToId: Record<string, string> = {}
      for (const [qid, brief] of Object.entries(briefContentById)) {
        if (brief) briefToId[brief] = qid
      }
      for (const mk of mistakesArr) {
        const brief = unwrap(mk?.brief_question) || ''
        const chosen = unwrap(mk?.chosen) || ''
        const correctAns = unwrap(mk?.correct) || ''
        const explain = unwrap(mk?.explain) || ''
        const tip = unwrap(mk?.tip) || ''
        const qid = briefToId[brief] || Object.entries(contentById).find(([, c]) => (c || '') === brief)?.[0] || null
        await svc.from('mistakes').insert({
          attempt_id: attemptId,
          question_id: qid,
          brief_question: brief,
          chosen_answer: chosen,
          correct_answer: correctAns,
          explanation: explain,
          tip: tip,
          created_at: new Date()
        })
      }
    } else {
      const wrongObjective = answers.filter(a => {
        const typ = typeById[a.questionId]
        if (typ === 'short_answer') return false
        const chosen = a.selected_answer || ''
        return chosen && correctById[a.questionId] && correctById[a.questionId] !== chosen
      })
      for (const a of wrongObjective) {
        const qid = a.questionId
        const brief = briefContentById[qid] || contentById[qid] || ''
        const chosenText = textByQKey[qid]?.[a.selected_answer || ''] || (a.selected_answer || '')
        const correctText = correctTextById[qid] || (correctById[qid] || '')
        const exp = explainById[qid] || ''
        await svc.from('mistakes').insert({
          attempt_id: attemptId,
          question_id: qid,
          brief_question: brief,
          chosen_answer: chosenText,
          correct_answer: correctText,
          explanation: exp,
          tip: '',
          created_at: new Date()
        })
      }
    }
    return NextResponse.json({ attemptId })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
