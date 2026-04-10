import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

function normalizeText(v: any) {
  return String(v ?? '').trim()
}

function normKey(v: any) {
  return normalizeText(v).toLowerCase()
}

function boolFromTfText(v: any): boolean | null {
  const s = normalizeText(v)
  if (!s) return null
  if (s === 'Đúng' || s === 'Dung' || s.toLowerCase() === 'dung') return true
  if (s === 'Sai' || s.toLowerCase() === 'sai') return false
  return null
}

function normalizeAnswerText(s: string) {
  return String(s || '').toLowerCase().trim().replace(/\s+/g, ' ')
}

function extractFirstNumber(s: string): number | null {
  const t = String(s || '').trim().replace(/\s+/g, ' ')
  const m = t.match(/-?\d+(?:[.,]\d+)?/)
  if (!m) return null
  const n = parseFloat(m[0].replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export async function POST(req: Request, { params }: { params: { examId: string } }) {
  const examId = params.examId
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const limit = Math.min(50, Math.max(1, Number(body.limit || 10)))
  const force = body.force === true

  const svc = serviceRoleClient()
  const { data: teacher } = await svc.from('teacher_profiles').select('id').eq('user_id', user.id).maybeSingle()
  if (!teacher?.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: exam } = await svc
    .from('official_exams')
    .select('id, teacher_user_id, created_by')
    .eq('id', examId)
    .maybeSingle()
  if (!exam || String(exam.teacher_user_id || exam.created_by) !== String(user.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: sheets, error: sheetsErr } = await svc
    .from('official_exam_sheets')
    .select('id, batch_id, sheet_no, detected_student_code, detected_paper_code, student_id, paper_id, match_status, process_status, ocr_json, metadata, created_at')
    .eq('official_exam_id', examId)
    .order('created_at', { ascending: true })
    .limit(200)
  if (sheetsErr) return NextResponse.json({ error: sheetsErr.message }, { status: 500 })

  const sheetIds = (sheets || []).map((s: any) => String(s.id))
  const { data: existingAttempts } = await svc
    .from('official_exam_attempts')
    .select('id, sheet_id, summary_json')
    .eq('official_exam_id', examId)
    .in('sheet_id', sheetIds)
    .limit(200000)
  const attemptBySheetId: Record<string, any> = {}
  for (const a of (existingAttempts || []) as any[]) {
    const sid = String(a.sheet_id || '')
    if (!sid) continue
    attemptBySheetId[sid] = a
  }

  const candidates = (sheets || []).filter((s: any) => force || !attemptBySheetId[String(s.id)])
  const toProcess = candidates.slice(0, limit)
  if (!toProcess.length) return NextResponse.json({ ok: true, processed: 0 })

  const processed: any[] = []

  for (const s of toProcess as any[]) {
    const sheetId = String(s.id)
    try {
      const ocr = (s.ocr_json && typeof s.ocr_json === 'object') ? s.ocr_json : {}
      const detectedStudent = normalizeText(s.detected_student_code || ocr.sbd || ocr.student_code || '')
      const detectedPaper = normalizeText(s.detected_paper_code || ocr.made || ocr.paper_code || '')
      const confidence = Number(ocr.confidence ?? s?.metadata?.confidence ?? null)

      await svc.from('official_exam_sheets').update({
        detected_student_code: detectedStudent || null,
        detected_paper_code: detectedPaper || null,
        process_status: 'verifying',
        metadata: { ...(s.metadata || {}), confidence: Number.isFinite(confidence) ? confidence : null }
      }).eq('id', sheetId)

      const { data: paper } = detectedPaper
        ? await svc.from('official_exam_papers').select('id, paper_code, metadata').eq('official_exam_id', examId).eq('paper_code', detectedPaper).maybeSingle()
        : { data: null as any }
      const paperId = paper?.id ? String(paper.id) : null
      const lessonId = paper?.metadata?.lesson_id ? String(paper.metadata.lesson_id) : null

      const { data: student } = detectedStudent
        ? await svc.from('official_exam_students').select('id, student_code, seat_no').eq('official_exam_id', examId).or(`seat_no.eq.${detectedStudent},student_code.eq.${detectedStudent}`).maybeSingle()
        : { data: null as any }
      const studentId = student?.id ? String(student.id) : null

      if (!paperId || !lessonId || !studentId) {
        await svc.from('official_exam_sheets').update({
          paper_id: paperId,
          student_id: studentId,
          match_status: 'unmatched',
          process_status: 'failed',
          metadata: { ...(s.metadata || {}), error: 'unmatched_paper_or_student' }
        }).eq('id', sheetId)
        processed.push({ sheet_id: sheetId, ok: false, reason: 'unmatched' })
        continue
      }

      const { data: qRows, error: qErr } = await svc
        .from('questions')
        .select('id, lesson_id, question_type, order_index, exam_score, created_at')
        .eq('lesson_id', lessonId)
        .limit(200000)
      if (qErr) throw new Error(qErr.message)

      const questions = (qRows || []).slice().sort((a: any, b: any) => {
        const ao = a.order_index ?? 1e9
        const bo = b.order_index ?? 1e9
        if (ao !== bo) return ao - bo
        return String(a.created_at || '').localeCompare(String(b.created_at || ''))
      })

      const choiceQs = questions.filter((q: any) => ['single_choice', 'true_false'].includes(normalizeText(q.question_type)))
      const tfGroupQs = questions.filter((q: any) => normalizeText(q.question_type) === 'true_false_group')
      const saQs = questions.filter((q: any) => normalizeText(q.question_type) === 'short_answer')

      const choiceQIds = choiceQs.map((q: any) => String(q.id))
      const tfQIds = tfGroupQs.map((q: any) => String(q.id))
      const saQIds = saQs.map((q: any) => String(q.id))

      const [optsRes, stRes, saRes] = await Promise.all([
        choiceQIds.length ? svc.from('question_options').select('question_id, option_key, is_correct').in('question_id', choiceQIds).limit(500000) : Promise.resolve({ data: [] as any[] }),
        tfQIds.length ? svc.from('question_statements').select('question_id, statement_key, correct_answer, score').in('question_id', tfQIds).order('sort_order', { ascending: true }).limit(500000) : Promise.resolve({ data: [] as any[] }),
        saQIds.length ? svc.from('question_short_answers').select('question_id, answer_text').in('question_id', saQIds).limit(500000) : Promise.resolve({ data: [] as any[] })
      ])

      const correctOptionByQ: Record<string, string> = {}
      for (const o of (optsRes.data || []) as any[]) {
        if (o.is_correct === true) correctOptionByQ[String(o.question_id)] = normalizeText(o.option_key).toUpperCase()
      }

      const statementsByQ: Record<string, any[]> = {}
      for (const r of (stRes.data || []) as any[]) {
        const qid = String(r.question_id || '')
        if (!qid) continue
        statementsByQ[qid] = statementsByQ[qid] || []
        statementsByQ[qid].push({
          statement_key: normKey(r.statement_key),
          correct_answer: (r.correct_answer === true) ? true : (r.correct_answer === false) ? false : null,
          score: r.score == null ? null : Number(r.score)
        })
      }

      const saRefsByQ: Record<string, string[]> = {}
      for (const r of (saRes.data || []) as any[]) {
        const qid = String(r.question_id || '')
        const txt = normalizeText(r.answer_text)
        if (!qid || !txt) continue
        saRefsByQ[qid] = saRefsByQ[qid] || []
        saRefsByQ[qid].push(txt)
      }

      const part1 = (ocr.part1 && typeof ocr.part1 === 'object') ? ocr.part1 : {}
      const part2 = (ocr.part2 && typeof ocr.part2 === 'object') ? ocr.part2 : {}
      const part3 = (ocr.part3 && typeof ocr.part3 === 'object') ? ocr.part3 : {}

      const nowIso = new Date().toISOString()
      let paperNo = 0
      let totalScore = 0
      let maxScore = 0
      let correctCount = 0
      let incorrectCount = 0
      let blankCount = 0

      const answerRows: any[] = []

      for (let i = 0; i < choiceQs.length; i++) {
        const q = choiceQs[i]
        paperNo += 1
        const qid = String(q.id)
        const selected = normalizeText(part1[String(i + 1)] || '').toUpperCase()
        const correct = normalizeText(correctOptionByQ[qid] || '').toUpperCase()
        const max = q.exam_score != null ? Number(q.exam_score) : 0.25
        const isBlank = !selected
        const isCorrect = !isBlank && !!correct && selected === correct
        const awarded = isCorrect ? max : 0

        maxScore += max
        totalScore += awarded
        if (isBlank) blankCount += 1
        else if (isCorrect) correctCount += 1
        else incorrectCount += 1

        answerRows.push({
          attempt_id: null,
          official_exam_id: examId,
          paper_id: paperId,
          student_id: studentId,
          sheet_id: sheetId,
          paper_question_no: paperNo,
          master_question_no: paperNo,
          master_question_id: null,
          question_id: qid,
          selected_answer: selected || null,
          normalized_answer: selected || null,
          correct_answer: correct || null,
          is_correct: !!correct ? isCorrect : null,
          score_awarded: awarded,
          max_score: max,
          answer_source: 'ocr',
          confidence: Number.isFinite(confidence) ? confidence : null,
          review_status: 'none',
          raw_ocr_text: null,
          metadata: { section: 'part1', index: i + 1 }
        })
      }

      for (let i = 0; i < tfGroupQs.length; i++) {
        const q = tfGroupQs[i]
        const qid = String(q.id)
        const group = (part2[String(i + 1)] && typeof part2[String(i + 1)] === 'object') ? part2[String(i + 1)] : {}
        const stList = statementsByQ[qid] || []

        for (const st of stList) {
          paperNo += 1
          const pickedText = normalizeText(group[st.statement_key] || '')
          const pickedBool = boolFromTfText(pickedText)
          const correctBool = (st.correct_answer === true) ? true : (st.correct_answer === false) ? false : null
          const max = st.score != null ? Number(st.score) : 0
          const isBlank = pickedBool == null
          const isCorrect = (!isBlank && correctBool != null) ? pickedBool === correctBool : null
          const awarded = isCorrect === true ? max : 0

          maxScore += max
          totalScore += awarded
          if (isBlank) blankCount += 1
          else if (isCorrect === true) correctCount += 1
          else if (isCorrect === false) incorrectCount += 1

          answerRows.push({
            attempt_id: null,
            official_exam_id: examId,
            paper_id: paperId,
            student_id: studentId,
            sheet_id: sheetId,
            paper_question_no: paperNo,
            master_question_no: paperNo,
            master_question_id: null,
            question_id: qid,
            selected_answer: pickedText || null,
            normalized_answer: pickedBool == null ? null : (pickedBool ? 'true' : 'false'),
            correct_answer: correctBool == null ? null : (correctBool ? 'Đúng' : 'Sai'),
            is_correct: isCorrect,
            score_awarded: awarded,
            max_score: max,
            answer_source: 'ocr',
            confidence: Number.isFinite(confidence) ? confidence : null,
            review_status: 'none',
            raw_ocr_text: null,
            metadata: { section: 'part2', group_index: i + 1, statement_key: st.statement_key }
          })
        }
      }

      for (let i = 0; i < saQs.length; i++) {
        const q = saQs[i]
        paperNo += 1
        const qid = String(q.id)
        const raw = normalizeText(part3[String(i + 1)] || '')
        const refs = (saRefsByQ[qid] || []).map(normalizeAnswerText).filter(Boolean)
        const max = q.exam_score != null ? Number(q.exam_score) : 0
        const canRule = refs.length > 0
        const studentNorm = normalizeAnswerText(raw)
        const numericStudent = extractFirstNumber(raw)
        const numericRefs = (saRefsByQ[qid] || []).map(extractFirstNumber).filter((n: any) => typeof n === 'number' && Number.isFinite(n)) as number[]
        const isNumericCorrect = numericStudent != null && numericRefs.some((r) => Math.abs(r - numericStudent) <= 1e-6)
        const isExactCorrect = canRule ? refs.includes(studentNorm) : false
        const isCorrect = canRule ? (isExactCorrect || isNumericCorrect) : null
        const isBlank = !raw
        const awarded = (isCorrect === true) ? max : 0

        maxScore += max
        totalScore += awarded
        if (isBlank) blankCount += 1
        else if (isCorrect === true) correctCount += 1
        else if (isCorrect === false) incorrectCount += 1

        answerRows.push({
          attempt_id: null,
          official_exam_id: examId,
          paper_id: paperId,
          student_id: studentId,
          sheet_id: sheetId,
          paper_question_no: paperNo,
          master_question_no: paperNo,
          master_question_id: null,
          question_id: qid,
          selected_answer: raw || null,
          normalized_answer: raw ? studentNorm : null,
          correct_answer: (saRefsByQ[qid] || []).length ? String((saRefsByQ[qid] || []).join(' | ')) : null,
          is_correct: isCorrect,
          score_awarded: awarded,
          max_score: max,
          answer_source: 'ocr',
          confidence: Number.isFinite(confidence) ? confidence : null,
          review_status: 'none',
          raw_ocr_text: null,
          metadata: { section: 'part3', index: i + 1, grading_method: canRule ? (isNumericCorrect && !isExactCorrect ? 'numeric' : 'exact') : 'none' }
        })
      }

      const existing = attemptBySheetId[sheetId] || null
      let attemptId: string
      if (existing?.id) {
        attemptId = String(existing.id)
        await svc.from('official_exam_attempt_answers').delete().eq('attempt_id', attemptId)
        const upd = await svc
          .from('official_exam_attempts')
          .update({
            student_id: studentId,
            paper_id: paperId,
            sheet_id: sheetId,
            status: 'graded',
            detected_student_code: detectedStudent || null,
            detected_paper_code: detectedPaper || null,
            total_score: totalScore,
            max_score: maxScore,
            correct_count: correctCount,
            incorrect_count: incorrectCount,
            blank_count: blankCount,
            grading_source: 'ocr',
            graded_at: nowIso,
            updated_at: nowIso
          } as any)
          .eq('id', attemptId)
          .select('id')
          .single()
        if (upd.error) throw new Error(upd.error.message)
      } else {
        const ins = await svc
          .from('official_exam_attempts')
          .insert({
            official_exam_id: examId,
            student_id: studentId,
            paper_id: paperId,
            sheet_id: sheetId,
            status: 'graded',
            detected_student_code: detectedStudent || null,
            detected_paper_code: detectedPaper || null,
            total_score: totalScore,
            max_score: maxScore,
            correct_count: correctCount,
            incorrect_count: incorrectCount,
            blank_count: blankCount,
            grading_source: 'ocr',
            graded_at: nowIso,
            summary_json: {},
            metadata: { lesson_id: lessonId, confidence: Number.isFinite(confidence) ? confidence : null }
          } as any)
          .select('id')
          .single()
        if (ins.error) throw new Error(ins.error.message)
        attemptId = String(ins.data.id)
      }

      for (const r of answerRows) r.attempt_id = attemptId
      const { error: ansErr } = await svc.from('official_exam_attempt_answers').insert(answerRows)
      if (ansErr) throw new Error(ansErr.message)

      await svc.from('official_exam_sheets').update({
        student_id: studentId,
        paper_id: paperId,
        match_status: 'matched',
        process_status: 'graded',
        updated_at: nowIso
      } as any).eq('id', sheetId)

      processed.push({ sheet_id: sheetId, ok: true, attempt_id: attemptId })
    } catch (e: any) {
      await svc.from('official_exam_sheets').update({ process_status: 'failed', metadata: { ...(s.metadata || {}), error: e?.message || 'failed' } }).eq('id', sheetId)
      processed.push({ sheet_id: sheetId, ok: false, reason: e?.message || 'failed' })
    }
  }

  const { count: gradedTotal } = await svc
    .from('official_exam_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('official_exam_id', examId)
    .eq('status', 'graded')
  await svc.from('official_exams').update({ total_graded: gradedTotal || 0 }).eq('id', examId)

  return NextResponse.json({ ok: true, processed })
}

