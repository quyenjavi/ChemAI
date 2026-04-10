import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

function normalizeText(v: any) {
  return String(v ?? '').trim()
}

export async function GET(_req: Request, { params }: { params: { examId: string, attemptId: string } }) {
  const examId = params.examId
  const attemptId = params.attemptId
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = serviceRoleClient()
  const { data: teacher } = await svc.from('teacher_profiles').select('id').eq('user_id', user.id).maybeSingle()
  if (!teacher?.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: exam } = await svc.from('official_exams').select('id, teacher_user_id, created_by, lesson_id').eq('id', examId).maybeSingle()
  if (!exam || String(exam.teacher_user_id || exam.created_by) !== String(user.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: attempt, error: aErr } = await svc
    .from('official_exam_attempts')
    .select('id, official_exam_id, student_id, sheet_id, paper_id, status, detected_student_code, detected_paper_code, total_score, max_score, correct_count, incorrect_count, blank_count, graded_at, metadata')
    .eq('id', attemptId)
    .eq('official_exam_id', examId)
    .maybeSingle()
  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 })
  if (!attempt) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [studentRes, paperRes, sheetRes, answersRes] = await Promise.all([
    svc.from('official_exam_students').select('id, student_code, full_name, class_name').eq('id', attempt.student_id).maybeSingle(),
    svc.from('official_exam_papers').select('id, paper_code').eq('id', attempt.paper_id).maybeSingle(),
    svc.from('official_exam_sheets').select('id, storage_bucket, storage_path, detected_student_code, detected_paper_code, final_student_code, final_paper_code, process_status').eq('id', attempt.sheet_id).maybeSingle(),
    svc.from('official_exam_attempt_answers').select('question_id, paper_question_no, selected_answer, is_correct, score_awarded, max_score').eq('attempt_id', attemptId).order('paper_question_no', { ascending: true }).limit(200000)
  ])

  const lessonId = exam.lesson_id ? String(exam.lesson_id) : null
  const { data: questions } = lessonId
    ? await svc.from('questions').select('id, question_type, order_index, content, tip, explanation, image_url, image_alt, image_caption').eq('lesson_id', lessonId).limit(200000)
    : { data: [] as any[] }

  const qIds = (questions || []).map((q: any) => String(q.id))
  const { data: options } = qIds.length
    ? await svc.from('question_options').select('question_id, option_key, option_text, is_correct, sort_order').in('question_id', qIds).limit(500000)
    : { data: [] as any[] }

  const optionsByQ: Record<string, any[]> = {}
  for (const o of (options || []) as any[]) {
    const qid = String(o.question_id || '')
    if (!qid) continue
    if (!optionsByQ[qid]) optionsByQ[qid] = []
    optionsByQ[qid].push(o)
  }
  for (const qid of Object.keys(optionsByQ)) {
    optionsByQ[qid].sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  }

  const answerByQId: Record<string, any> = {}
  for (const a of (answersRes.data || []) as any[]) answerByQId[String(a.question_id)] = a

  const orderedQuestions = (questions || []).slice().sort((a: any, b: any) => {
    const ao = a.order_index ?? 1e9
    const bo = b.order_index ?? 1e9
    return ao - bo
  })

  let sheetSignedUrl: string | null = null
  if (sheetRes.data?.storage_bucket && sheetRes.data?.storage_path) {
    const { data } = await svc.storage.from(String(sheetRes.data.storage_bucket)).createSignedUrl(String(sheetRes.data.storage_path), 60 * 10)
    sheetSignedUrl = data?.signedUrl || null
  }

  const items = orderedQuestions.map((q: any, idx: number) => {
    const a = answerByQId[String(q.id)] || null
    const opts = optionsByQ[String(q.id)] || []
    const correct = opts.find((o) => o.is_correct === true)?.option_key ? String(opts.find((o) => o.is_correct === true).option_key) : null
    return {
      no: idx + 1,
      question_id: String(q.id),
      content: normalizeText(q.content),
      question_type: normalizeText(q.question_type) || 'single_choice',
      tip: q.tip || null,
      explanation: q.explanation || null,
      image_url: q.image_url || null,
      image_alt: q.image_alt || null,
      image_caption: q.image_caption || null,
      options: opts.map((o) => ({
        key: normalizeText(o.option_key),
        text: normalizeText(o.option_text),
        is_correct: o.is_correct === true
      })),
      student_choice: a?.selected_answer ? normalizeText(a.selected_answer) : '',
      correct_choice: correct ? normalizeText(correct) : '',
      is_correct: a?.is_correct === true,
      score_awarded: a?.score_awarded ?? 0,
      max_score: a?.max_score ?? 0
    }
  })

  return NextResponse.json({
    attempt: {
      id: String(attempt.id),
      total_score: attempt.total_score,
      max_score: attempt.max_score,
      correct_count: attempt.correct_count,
      incorrect_count: attempt.incorrect_count,
      blank_count: attempt.blank_count,
      status: normalizeText(attempt.status),
      graded_at: attempt.graded_at || null
    },
    student: studentRes.data ? {
      student_code: normalizeText(studentRes.data.student_code),
      full_name: normalizeText(studentRes.data.full_name),
      class_name: normalizeText(studentRes.data.class_name)
    } : null,
    paper: paperRes.data ? {
      paper_code: normalizeText(paperRes.data.paper_code),
      lesson_id: lessonId
    } : null,
    sheet: sheetRes.data ? {
      id: String(sheetRes.data.id),
      detected_student_code: sheetRes.data.final_student_code || sheetRes.data.detected_student_code || null,
      detected_paper_code: sheetRes.data.final_paper_code || sheetRes.data.detected_paper_code || null,
      process_status: normalizeText(sheetRes.data.process_status) || null,
      signed_url: sheetSignedUrl
    } : null,
    questions: items
  })
}
