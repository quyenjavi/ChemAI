import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'
import { env } from '@/lib/env'

export const maxDuration = 300

type AnswerPayload = {
  questionId: string
  selected_answer?: string
  answer_text?: string
  statement_answers?: Record<string, boolean | null>
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
    const { data: lessonRow } = await svc.from('lessons').select('id,title,lesson_type').eq('id', attempt.lesson_id).maybeSingle()
    const lessonType = (lessonRow?.lesson_type === 'exam' || lessonRow?.lesson_type === 'practice') ? lessonRow.lesson_type : 'practice'

    const answerMap: Record<string, AnswerPayload> = {}
    for (const a of answers) {
      const qid = String(a?.questionId || '')
      if (!qid) continue
      answerMap[qid] = a
    }

    // 1. Get frozen question IDs for the attempt
    const { data: frozenQs } = await svc
      .from('quiz_attempt_questions')
      .select('question_id')
      .eq('attempt_id', attemptId)
    
    let qIds: string[] = []
    if (frozenQs && frozenQs.length > 0) {
      qIds = frozenQs.map(f => f.question_id)
    } else if (lessonType === 'exam') {
      const { data: allQs } = await svc.from('questions').select('id').eq('lesson_id', attempt.lesson_id).order('order_index', { ascending: true }).limit(1000)
      qIds = (allQs || []).map((q: any) => q.id).filter(Boolean)
    } else {
      qIds = Array.from(new Set(answers.map(a => a.questionId).filter(Boolean)))
      if (qIds.length === 0) return NextResponse.json({ error: 'Missing questions' }, { status: 400 })
    }

    const { data: qRows } = await svc.from('questions').select('*').in('id', qIds)
    const byId: Record<string, any> = Object.fromEntries((qRows || []).map((q: any) => [q.id, q]))
    const orderedQuestions = qIds.map((id) => byId[id]).filter(Boolean)

    const typeById: Record<string, string> = Object.fromEntries(orderedQuestions.map((q: any) => [q.id, q.question_type]))
    const contentById: Record<string, string> = Object.fromEntries(orderedQuestions.map((q: any) => [q.id, q.content || '']))
    const orderById: Record<string, number> = Object.fromEntries(orderedQuestions.map((q: any) => [q.id, q.order_index ?? 0]))
    const briefContentById: Record<string, string> = Object.fromEntries(orderedQuestions.map((q: any) => [q.id, q.brief_content || '']))
    const topicById: Record<string, string> = Object.fromEntries(orderedQuestions.map((q: any) => [q.id, q.topic || '']))
    const explainById: Record<string, string> = Object.fromEntries(orderedQuestions.map((q: any) => [q.id, q.brief_explanation || q.explanation || '']))
    const maxScoreByQ: Record<string, number> = Object.fromEntries(orderedQuestions.map((q: any) => {
      const val =
        (typeof q.exam_score === 'number' ? q.exam_score : null) ??
        (typeof q.max_score === 'number' ? q.max_score : 0)
      return [q.id, val]
    }))

    const choiceIds = qIds.filter(id => ['single_choice', 'true_false'].includes(typeById[id]))
    const groupIds = qIds.filter(id => typeById[id] === 'true_false_group')
    const saIds = qIds.filter(id => typeById[id] === 'short_answer')

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

    let refArrById: Record<string, string[]> = {}
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
        const arr = grouped[k].filter(Boolean)
        refArrById[k] = arr
        refById[k] = arr.join('; ')
      }
    }

    let statementsByQ: Record<string, any[]> = {}
    if (groupIds.length) {
      const { data: st } = await svc
        .from('question_statements')
        .select('*')
        .in('question_id', groupIds)
        .order('sort_order', { ascending: true })
      for (const r of (st || []) as any[]) {
        const arr = statementsByQ[r.question_id] || []
        arr.push(r)
        statementsByQ[r.question_id] = arr
      }
    }

    function normalizeText(s: string) {
      return s.toLowerCase().trim().replace(/\s+/g, ' ')
    }

    function extractFirstNumber(s: string): number | null {
      const t = String(s || '').trim().replace(/\s+/g, ' ')
      const m = t.match(/-?\d+(?:[.,]\d+)?/)
      if (!m) return null
      const n = parseFloat(m[0].replace(',', '.'))
      return Number.isFinite(n) ? n : null
    }

    const getStatementCorrect = (row: any): boolean | null => {
      if (typeof row.is_correct === 'boolean') return row.is_correct
      if (typeof row.correct_answer === 'boolean') return row.correct_answer
      if (typeof row.is_true === 'boolean') return row.is_true
      if (typeof row.correct_value === 'boolean') return row.correct_value
      if (typeof row.answer === 'boolean') return row.answer
      return null
    }

    await svc.from('quiz_attempt_answers').delete().eq('attempt_id', attemptId)
    await svc.from('mistakes').delete().eq('attempt_id', attemptId)

    const now = new Date()
    const inserts: any[] = []

    for (const q of orderedQuestions) {
      const qid = q.id
      const typ = q.question_type
      if (typ === 'true_false_group') {
        const st = statementsByQ[qid] || []
        const payload = answerMap[qid]
        const stAns = payload?.statement_answers || {}
        for (const s of st) {
          const correctVal = getStatementCorrect(s)
          const picked = typeof stAns?.[s.id] === 'boolean' ? stAns[s.id] : null
          const isCorrect = (picked != null && correctVal != null) ? picked === correctVal : null
          const maxScore = (typeof s.score === 'number')
            ? s.score
            : (typeof s.max_score === 'number' ? s.max_score : 0)
          inserts.push({
            attempt_id: attemptId,
            question_id: qid,
            statement_id: s.id,
            selected_answer: picked == null ? null : (picked ? 'A' : 'B'),
            is_correct: isCorrect,
            score_awarded: isCorrect === true ? maxScore : 0,
            max_score: maxScore,
            grading_method: 'true_false_statement',
            created_at: now
          })
        }
        continue
      }

      if (typ === 'true_false') {
        const payload = answerMap[qid]
        const chosen = (payload?.selected_answer || '').trim()
        const correctKey = correctById[qid] || ''
        const isCorrect = !!(chosen && correctKey && correctKey === chosen)
        const maxScore = maxScoreByQ[qid] ?? 0
        inserts.push({
          attempt_id: attemptId,
          question_id: qid,
          selected_answer: chosen || null,
          is_correct: isCorrect,
          score_awarded: isCorrect ? maxScore : 0,
          max_score: maxScore,
          grading_method: 'option_match',
          created_at: now
        })
        continue
      }

      if (typ === 'short_answer') {
        const payload = answerMap[qid]
        const txt = (payload?.answer_text || '').trim()
        const refs = (refArrById[qid] || []).map(normalizeText).filter(Boolean)
        const canRule = refs.length > 0
        const studentNorm = normalizeText(txt)
        const numericStudent = extractFirstNumber(txt)
        const numericRefs = (refArrById[qid] || []).map(extractFirstNumber).filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
        const isNumericCorrect = numericStudent != null && numericRefs.some((r) => Math.abs(r - numericStudent) <= 1e-6)
        const isExactCorrect = canRule ? refs.includes(studentNorm) : false
        const isCorrect = canRule ? (isExactCorrect || isNumericCorrect) : null
        const maxScore = maxScoreByQ[qid] ?? 0
        inserts.push({
          attempt_id: attemptId,
          question_id: qid,
          answer_text: txt || null,
          is_correct: isCorrect,
          score_awarded: canRule ? (isCorrect === true ? maxScore : 0) : null,
          max_score: maxScore,
          grading_method: canRule ? (isNumericCorrect && !isExactCorrect ? 'short_answer_numeric' : 'short_answer_exact') : 'short_answer_ai_pending',
          created_at: now
        })
        continue
      }

      const payload = answerMap[qid]
      const chosen = (payload?.selected_answer || '').trim()
      const correctKey = correctById[qid] || ''
      const isCorrect = !!(chosen && correctKey && correctKey === chosen)
      const maxScore = maxScoreByQ[qid] ?? 0
      inserts.push({
        attempt_id: attemptId,
        question_id: qid,
        selected_answer: chosen || null,
        is_correct: isCorrect,
        score_awarded: isCorrect ? maxScore : 0,
        max_score: maxScore,
        grading_method: 'option_match',
        created_at: now
      })
    }

    if (inserts.length) {
      const { error: insErr } = await svc.from('quiz_attempt_answers').insert(inserts)
      if (insErr) return NextResponse.json({ error: insErr.message || 'Insert failed' }, { status: 500 })
    }

    const totalUnits = inserts.length
    const correctUnits = inserts.filter(r => r.is_correct === true).length
    const accuracyPercent = totalUnits ? Math.round((correctUnits / totalUnits) * 100) : 0
    const rawScore = inserts.reduce((acc, r) => acc + (Number(r.score_awarded) || 0), 0)
    const totalScore = inserts.reduce((acc, r) => acc + (Number(r.max_score) || 0), 0)
    const scorePercent = totalScore ? Math.round((rawScore / totalScore) * 10000) / 100 : 0
    const questionCount = orderedQuestions.length
    const correctQuestionCount = (() => {
      const byQ: Record<string, { total: number, correct: number }> = {}
      for (const r of inserts) {
        const qid = r.question_id
        const st = byQ[qid] || { total: 0, correct: 0 }
        st.total += 1
        if (r.is_correct === true) st.correct += 1
        byQ[qid] = st
      }
      let count = 0
      for (const qid of qIds) {
        const typ = typeById[qid]
        const st = byQ[qid]
        if (!st) continue
        if (typ === 'true_false_group') {
          if (st.total > 0 && st.correct === st.total) count += 1
          continue
        }
        if (st.correct >= 1) count += 1
      }
      return count
    })()

    await svc.from('quiz_attempts')
      .update({
        mode: lessonType,
        status: 'submitted',
        raw_score: rawScore,
        total_score: totalScore,
        accuracy_correct_units: correctUnits,
        accuracy_total_units: totalUnits,
        accuracy_percent: accuracyPercent,
        total_questions: questionCount,
        correct_answers: correctQuestionCount,
        score_percent: lessonType === 'exam' ? scorePercent : accuracyPercent
      })
      .eq('id', attemptId)

    const formatNumber = (v: any) => {
      const n = typeof v === 'number' ? v : Number(v)
      if (!Number.isFinite(n)) return 0
      const rounded = Math.round(n * 1000000) / 1000000
      return rounded
    }

    function formatAttemptTextLite(): string {
      const boolText = (v: boolean | null) => (v === true ? 'Đúng' : v === false ? 'Sai' : '—')
      const safe = (s: any) => {
        const t = String(s ?? '').trim().replace(/\s+/g, ' ')
        return t || '—'
      }

      const correctItems: Array<{ question_content: string, correct_answer_content: string, student_answer_content: string }> = []
      const wrongItems: Array<{ question_content: string, correct_answer_content: string, student_answer_content: string }> = []
      const shortAnswerItems: Array<{ question_id: string, question_content: string, student_answer: string, reference_answers: string }> = []

      for (const q of orderedQuestions) {
        const qid = q.id
        const typ = q.question_type
        const qContent = contentById[qid] || ''

        if (typ === 'single_choice' || typ === 'true_false') {
          const selectedKey = (answerMap[qid]?.selected_answer || '').trim()
          const selectedText = selectedKey ? (textByQKey[qid]?.[selectedKey] || selectedKey) : '—'
          const correctKey = correctById[qid] || ''
          const correctText = correctTextById[qid] || (correctKey ? (textByQKey[qid]?.[correctKey] || correctKey) : '—')
          const isCorrect = !!(selectedKey && correctKey && selectedKey === correctKey)
          const target = isCorrect ? correctItems : wrongItems
          target.push({
            question_content: safe(qContent),
            correct_answer_content: safe(correctText),
            student_answer_content: safe(selectedText)
          })
          continue
        }

        if (typ === 'true_false_group') {
          const st = (statementsByQ[qid] || []).slice().sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          const stAns = answerMap[qid]?.statement_answers || {}
          for (const s of st) {
            const picked = typeof stAns?.[s.id] === 'boolean' ? stAns[s.id] : null
            const correctValRaw = getStatementCorrect(s)
            const correctVal = (typeof correctValRaw === 'boolean') ? correctValRaw : null
            const ok = (picked != null && correctVal != null) ? picked === correctVal : false
            const target = ok ? correctItems : wrongItems
            target.push({
              question_content: safe(`${qContent} — ${s.statement_text || ''}`),
              correct_answer_content: boolText(correctVal),
              student_answer_content: boolText(picked)
            })
          }
          continue
        }

        if (typ === 'short_answer') {
          const student = (answerMap[qid]?.answer_text || '').trim()
          const refs = (refArrById[qid] || []).filter(Boolean).join(' | ')
          shortAnswerItems.push({
            question_id: qid,
            question_content: safe(qContent),
            student_answer: safe(student),
            reference_answers: safe(refs)
          })
          continue
        }
      }

      const lines: string[] = []
      lines.push('TÓM TẮT')
      lines.push(`lesson_type: ${lessonType}`)
      lines.push(`raw_score: ${formatNumber(rawScore)}`)
      lines.push(`total_score: ${formatNumber(totalScore)}`)
      lines.push(`accuracy_percent: ${formatNumber(accuracyPercent)}`)
      lines.push('')

      lines.push('DANH SÁCH CÂU ĐÚNG')
      for (const item of correctItems) {
        lines.push('[CORRECT]')
        lines.push(`question_content: ${item.question_content}`)
        lines.push(`correct_answer_content: ${item.correct_answer_content}`)
        lines.push(`student_answer_content: ${item.student_answer_content}`)
        lines.push('')
      }

      lines.push('DANH SÁCH CÂU SAI')
      for (const item of wrongItems) {
        lines.push('[WRONG]')
        lines.push(`question_content: ${item.question_content}`)
        lines.push(`correct_answer_content: ${item.correct_answer_content}`)
        lines.push(`student_answer_content: ${item.student_answer_content}`)
        lines.push('')
      }

      lines.push('DANH SÁCH SHORT ANSWER')
      for (const item of shortAnswerItems) {
        lines.push('[SA]')
        lines.push(`question_id: ${item.question_id}`)
        lines.push(`question_content: ${item.question_content}`)
        lines.push(`student_answer: ${item.student_answer}`)
        lines.push(`reference_answers: ${item.reference_answers}`)
        lines.push('')
      }

      return lines.join('\n').trim()
    }

    const parseMaybeJson = (v: any) => {
      if (!v) return null
      if (typeof v === 'object') return v
      if (typeof v !== 'string') return null
      const s0 = v.trim()
      const s1 = s0
        .replace(/^```(?:json)?/i, '')
        .replace(/```$/i, '')
        .trim()
      const candidates = [s1, s0]
      for (const s of candidates) {
        try {
          return JSON.parse(s)
        } catch {}
        const start = s.indexOf('{')
        const end = s.lastIndexOf('}')
        if (start >= 0 && end > start) {
          const mid = s.slice(start, end + 1)
          try {
            return JSON.parse(mid)
          } catch {}
        }
      }
      return null
    }

    async function callDifyWorkflow(textAttempt: string) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 300000)
      let res: Response
      try {
        console.log('--- Calling Dify Workflow ---')
        console.log('Base URL:', env.difyBaseUrl)
        console.log('Payload:', JSON.stringify({
          inputs: { attempt_text: textAttempt },
          response_mode: 'blocking',
          user: uid
        }, null, 2))
        
        res = await fetch(`${env.difyBaseUrl}/workflows/run`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Authorization': `Bearer ${env.difyWorkflowKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            inputs: { attempt_text: textAttempt },
            response_mode: 'blocking',
            user: uid
          })
        })
      } finally {
        clearTimeout(timeout)
      }
      if (!res.ok) {
        const text = await res.text()
        console.error('--- Dify Workflow Error ---')
        console.error('Status:', res.status)
        console.error('Response:', text)
        throw new Error(`Dify workflow error: ${res.status} ${text}`)
      }
      const json = await res.json()
      console.log('--- Dify Workflow Success ---')
      console.log('Response:', JSON.stringify(json, null, 2))
      return json
    }
    const attemptText = formatAttemptTextLite()
    let report_json: any = null
    if (!env.difyWorkflowKey || !env.difyBaseUrl) {
      report_json = { error: 'missing_dify_env', attempt_text: attemptText }
    } else {
      try {
        const wfRes = await callDifyWorkflow(attemptText)
        const root = wfRes?.data || wfRes
        const extracted =
          (parseMaybeJson(root?.data?.outputs?.text) ||
            parseMaybeJson(root?.outputs?.text) ||
            root?.data?.outputs ||
            root?.outputs ||
            root?.data ||
            root) ?? null

        const short_answer_results = Array.isArray(extracted?.short_answer_results)
          ? extracted.short_answer_results
          : (Array.isArray(extracted?.feedback?.short_answer_results) ? extracted.feedback.short_answer_results : [])

        let fb = extracted?.feedback?.feedback ?? extracted?.feedback ?? null
        if (fb && typeof fb === 'object' && 'grading' in fb && 'feedback' in fb) fb = (fb as any).feedback
        report_json = { feedback: fb, short_answer_results }

        const baseSaByQ: Record<string, any> = Object.fromEntries(
          inserts.filter(r => typeById[r.question_id] === 'short_answer').map(r => [r.question_id, r])
        )
        if (Array.isArray(short_answer_results) && short_answer_results.length) {
          for (const r of short_answer_results as any[]) {
            const qid = String(r?.question_id || '').trim()
            if (!qid) continue
            const base = baseSaByQ[qid]
            const nextIsCorrect = typeof r?.is_correct === 'boolean' ? r.is_correct : null
            const comment = String(r?.comment || '').trim()
            const explain = String(r?.explain || '').trim()
            const chosen = r?.chosen != null ? String(r.chosen) : ''
            const correct = r?.correct != null ? String(r.correct) : ''
            const update: any = {
              ai_feedback: JSON.stringify({ comment, explain, chosen, correct })
            }
            if (base && base.is_correct == null && typeof nextIsCorrect === 'boolean') {
              update.is_correct = nextIsCorrect
              update.score_awarded = nextIsCorrect ? (Number(base.max_score) || 0) : 0
              update.grading_method = 'short_answer_ai'
            }
            await svc.from('quiz_attempt_answers')
              .update(update)
              .eq('attempt_id', attemptId)
              .eq('question_id', qid)
          }
        }

        const { data: finalRows } = await svc
          .from('quiz_attempt_answers')
          .select('question_id,statement_id,is_correct,score_awarded,max_score')
          .eq('attempt_id', attemptId)
        const final = finalRows || []
        const totalUnits2 = final.length
        const correctUnits2 = final.filter(r => r.is_correct === true).length
        const accuracyPercent2 = totalUnits2 ? Math.round((correctUnits2 / totalUnits2) * 100) : 0
        const rawScore2 = final.reduce((acc, r) => acc + (Number(r.score_awarded) || 0), 0)
        const totalScore2 = final.reduce((acc, r) => acc + (Number(r.max_score) || 0), 0)
        const scorePercent2 = totalScore2 ? Math.round((rawScore2 / totalScore2) * 10000) / 100 : 0
        const byQ: Record<string, { total: number, correct: number }> = {}
        for (const r of final as any[]) {
          const qid = r.question_id
          const st = byQ[qid] || { total: 0, correct: 0 }
          st.total += 1
          if (r.is_correct === true) st.correct += 1
          byQ[qid] = st
        }
        let correctQuestionCount2 = 0
        for (const qid of qIds) {
          const typ = typeById[qid]
          const st = byQ[qid]
          if (!st) continue
          if (typ === 'true_false_group') {
            if (st.total > 0 && st.correct === st.total) correctQuestionCount2 += 1
            continue
          }
          if (st.correct >= 1) correctQuestionCount2 += 1
        }
        await svc.from('quiz_attempts')
          .update({
            mode: lessonType,
            status: 'submitted',
            raw_score: rawScore2,
            total_score: totalScore2,
            accuracy_correct_units: correctUnits2,
            accuracy_total_units: totalUnits2,
            accuracy_percent: accuracyPercent2,
            total_questions: orderedQuestions.length,
            correct_answers: correctQuestionCount2,
            score_percent: lessonType === 'exam' ? scorePercent2 : accuracyPercent2
          })
          .eq('id', attemptId)
      } catch (err) {
        console.error('Dify workflow failed, will not save report', err)
        // Do not save a report if Dify fails, let the client know
        throw new Error(`Dify workflow failed: ${(err as any)?.message}`);
      }
    }
    // This part is now only reached if Dify succeeds or was skipped
    await svc.from('attempt_reports')
      .upsert({ 
        attempt_id: attemptId, 
        user_id: uid, 
        report_content: JSON.stringify(report_json) 
      }, { onConflict: 'attempt_id' })

    return NextResponse.json({ attemptId, mode: lessonType })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
