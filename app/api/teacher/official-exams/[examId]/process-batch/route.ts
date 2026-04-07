import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'
import { env } from '@/lib/env'

function normalizeText(v: any) {
  return String(v ?? '').trim()
}

function pickJson(text: string) {
  const s = text.trim()
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first >= 0 && last >= 0 && last > first) {
    return s.slice(first, last + 1)
  }
  return s
}

function toBase64(buf: Buffer) {
  return buf.toString('base64')
}

async function parseSheetWithOpenAI(image: Buffer, contentType: string) {
  const model = env.openaiModel
  if (!env.openaiApiKey) throw new Error('Missing OPENAI_API_KEY')
  const dataUrl = `data:${contentType || 'image/jpeg'};base64,${toBase64(image)}`

  const prompt = [
    'Bạn là hệ thống OCR cho phiếu trả lời trắc nghiệm.',
    'Hãy trích xuất chính xác:',
    '- paper_code: mã đề (chuỗi số, ví dụ 101/102/103/104)',
    '- student_code: SBD / mã học sinh (chuỗi ký tự/số)',
    '- answers: danh sách đáp án theo thứ tự câu, mỗi phần tử: { no: <số câu>, choice: "A"|"B"|"C"|"D"|""|"MULTI" }',
    '- confidence: số 0..1',
    'Quy tắc:',
    '- Nếu bỏ trống: choice=""',
    '- Nếu tô nhiều hơn 1 đáp án: choice="MULTI"',
    '- Nếu không đọc được paper_code hoặc student_code: để chuỗi rỗng.',
    'Chỉ trả về JSON hợp lệ, không thêm chữ khác.'
  ].join('\n')

  const r = await fetch(`${env.openaiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.openaiApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUrl } }
          ]
        }
      ]
    })
  })

  const j = await r.json().catch(() => ({}))
  if (!r.ok) {
    const msg = j?.error?.message || `OpenAI error ${r.status}`
    throw new Error(msg)
  }

  const content = j?.choices?.[0]?.message?.content
  if (!content) throw new Error('No OpenAI content')
  const jsonText = pickJson(String(content))
  return JSON.parse(jsonText)
}

export async function POST(req: Request, { params }: { params: { examId: string } }) {
  const examId = params.examId
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const limit = Math.min(20, Math.max(1, Number(body.limit || 5)))

  const svc = serviceRoleClient()
  const { data: teacher } = await svc.from('teacher_profiles').select('id').eq('user_id', user.id).maybeSingle()
  if (!teacher?.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: exam } = await svc.from('official_exams').select('id, teacher_id').eq('id', examId).maybeSingle()
  if (!exam || String(exam.teacher_id) !== String(teacher.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: sheets, error: sheetsErr } = await svc
    .from('official_exam_sheets')
    .select('id, batch_id, sheet_no, storage_bucket, storage_path')
    .eq('official_exam_id', examId)
    .eq('process_status', 'uploaded')
    .order('created_at', { ascending: true })
    .limit(limit)

  if (sheetsErr) return NextResponse.json({ error: sheetsErr.message }, { status: 500 })
  if (!sheets?.length) return NextResponse.json({ ok: true, processed: 0 })

  const processed: any[] = []

  for (const s of sheets as any[]) {
    const sheetId = String(s.id)
    await svc.from('official_exam_sheets').update({ process_status: 'verifying' }).eq('id', sheetId)

    try {
      const bucket = normalizeText(s.storage_bucket)
      const path = normalizeText(s.storage_path)
      const { data: dl, error: dlErr } = await svc.storage.from(bucket).download(path)
      if (dlErr) throw new Error(dlErr.message)
      const arr = await dl.arrayBuffer()
      const buf = Buffer.from(arr)
      const contentType = (dl as any)?.type || 'image/jpeg'

      const ocr = await parseSheetWithOpenAI(buf, contentType)

      const paper_code = normalizeText(ocr.paper_code)
      const student_code = normalizeText(ocr.student_code)
      const confidence = Number(ocr.confidence)
      const answersRaw = Array.isArray(ocr.answers) ? ocr.answers : []

      const { data: paper } = paper_code
        ? await svc.from('official_exam_papers').select('id, paper_code, metadata').eq('official_exam_id', examId).eq('paper_code', paper_code).maybeSingle()
        : { data: null as any }
      const paperId = paper?.id ? String(paper.id) : null
      const lessonId = paper?.metadata?.lesson_id ? String(paper.metadata.lesson_id) : null

      const { data: student } = student_code
        ? await svc.from('official_exam_students').select('id, student_code').eq('official_exam_id', examId).eq('student_code', student_code).maybeSingle()
        : { data: null as any }
      const studentId = student?.id ? String(student.id) : null

      if (!paperId || !lessonId || !studentId) {
        await svc.from('official_exam_sheets').update({
          detected_paper_code: paper_code || null,
          detected_student_code: student_code || null,
          paper_id: paperId,
          student_id: studentId,
          match_status: 'unmatched',
          process_status: 'failed',
          ocr_json: ocr,
          metadata: { error: 'unmatched_paper_or_student', confidence: Number.isFinite(confidence) ? confidence : null }
        }).eq('id', sheetId)
        processed.push({ sheet_id: sheetId, ok: false, reason: 'unmatched' })
        continue
      }

      const { data: qs } = await svc
        .from('questions')
        .select('id, lesson_id, question_type, order_index, exam_score, created_at')
        .eq('lesson_id', lessonId)
        .limit(200000)

      const questions = (qs || []).slice().sort((a: any, b: any) => {
        const ao = a.order_index ?? 1e9
        const bo = b.order_index ?? 1e9
        if (ao !== bo) return ao - bo
        return String(a.created_at || '').localeCompare(String(b.created_at || ''))
      })

      const qIds = questions.map((q: any) => String(q.id))
      const { data: opts } = await svc
        .from('question_options')
        .select('question_id, option_key, is_correct')
        .in('question_id', qIds)
        .limit(500000)

      const correctByQ: Record<string, string> = {}
      for (const o of (opts || []) as any[]) {
        if (o.is_correct === true) correctByQ[String(o.question_id)] = normalizeText(o.option_key).toUpperCase()
      }

      const answerByNo: Record<number, string> = {}
      for (const row of answersRaw as any[]) {
        const no = Number(row?.no)
        const ch = normalizeText(row?.choice).toUpperCase()
        if (Number.isFinite(no) && no > 0) answerByNo[no] = ch
      }

      let totalScore = 0
      let rawScore = 0
      let correctCount = 0
      let wrongCount = 0
      let blankCount = 0

      const answerRows: any[] = []
      questions.forEach((q: any, idx: number) => {
        const qNo = idx + 1
        const max = q.exam_score != null ? Number(q.exam_score) : 0.25
        const qid = String(q.id)
        const studentChoice = normalizeText(answerByNo[qNo] || '')
        const correctChoice = normalizeText(correctByQ[qid] || '')
        const isBlank = !studentChoice
        const isMulti = studentChoice === 'MULTI'
        const isCorrect = !isBlank && !isMulti && correctChoice && studentChoice === correctChoice
        const awarded = isCorrect ? max : 0

        totalScore += max
        rawScore += awarded
        if (isBlank) blankCount += 1
        else if (isCorrect) correctCount += 1
        else wrongCount += 1

        answerRows.push({
          official_exam_id: examId,
          paper_id: paperId,
          sheet_id: sheetId,
          student_id: studentId,
          attempt_id: null,
          question_id: qid,
          paper_question_no: qNo,
          master_question_no: qNo,
          paper_question_id: null,
          master_question_id: null,
          student_answer_text: null,
          student_answer_option_key: studentChoice || null,
          is_correct: isCorrect,
          score_awarded: awarded,
          max_score: max,
          confidence: Number.isFinite(confidence) ? confidence : null,
          needs_review: isMulti || !correctChoice,
          review_status: 'none',
          review_adjustment_type: 'none',
          review_adjustment_note: null,
          raw_data_json: { ocr_choice: studentChoice || null }
        })
      })

      const { data: attempt, error: attemptErr } = await svc
        .from('official_exam_attempts')
        .insert({
          official_exam_id: examId,
          student_id: studentId,
          sheet_id: sheetId,
          paper_id: paperId,
          status: 'graded',
          grading_status: 'graded',
          raw_score: rawScore,
          total_score: totalScore,
          correct_count: correctCount,
          wrong_count: wrongCount,
          blank_count: blankCount,
          graded_at: new Date().toISOString(),
          metadata: { paper_code, student_code, lesson_id: lessonId, confidence: Number.isFinite(confidence) ? confidence : null }
        })
        .select('id')
        .single()

      if (attemptErr) throw new Error(attemptErr.message)
      const attemptId = String(attempt.id)

      for (const r of answerRows) r.attempt_id = attemptId
      const { error: ansErr } = await svc.from('official_exam_attempt_answers').insert(answerRows)
      if (ansErr) throw new Error(ansErr.message)

      await svc.from('official_exam_sheets').update({
        detected_paper_code: paper_code || null,
        detected_student_code: student_code || null,
        paper_id: paperId,
        student_id: studentId,
        match_status: 'matched',
        process_status: 'verified',
        ocr_json: ocr,
        metadata: { confidence: Number.isFinite(confidence) ? confidence : null, lesson_id: lessonId }
      }).eq('id', sheetId)

      if (s.batch_id) {
        await svc.from('official_exam_sheet_batches').update({ processed_sheets: (s.sheet_no || 0) }).eq('id', s.batch_id)
      }

      processed.push({ sheet_id: sheetId, ok: true, attempt_id: attemptId })
    } catch (e: any) {
      await svc.from('official_exam_sheets').update({
        process_status: 'failed',
        metadata: { error: e?.message || 'failed' }
      }).eq('id', sheetId)
      processed.push({ sheet_id: sheetId, ok: false, reason: e?.message || 'failed' })
    }
  }

  return NextResponse.json({ ok: true, processed })
}

