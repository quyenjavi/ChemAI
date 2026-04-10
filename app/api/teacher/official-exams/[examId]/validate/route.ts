import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

function normalizeText(v: any) {
  return String(v ?? '').trim()
}

export async function POST(_req: Request, { params }: { params: { examId: string } }) {
  const examId = params.examId
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = serviceRoleClient()
  const { data: teacher } = await svc.from('teacher_profiles').select('id').eq('user_id', user.id).maybeSingle()
  if (!teacher?.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: exam } = await svc.from('official_exams').select('id, teacher_user_id, created_by').eq('id', examId).maybeSingle()
  if (!exam || String(exam.teacher_user_id || exam.created_by) !== String(user.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: papers, error: papersErr } = await svc
    .from('official_exam_papers')
    .select('id, paper_code, metadata')
    .eq('official_exam_id', examId)
    .order('paper_code', { ascending: true })
    .limit(200)

  if (papersErr) return NextResponse.json({ error: papersErr.message }, { status: 500 })
  if (!papers?.length) return NextResponse.json({ errors: [{ message: 'Chưa có mã đề nào. Hãy thêm ít nhất 1 mã đề.' }], warnings: [] })

  const errors: Array<any> = []
  const warnings: Array<any> = []

  const mapped = papers.map((p: any) => ({
    id: String(p.id),
    paper_code: normalizeText(p.paper_code),
    lesson_id: p?.metadata?.lesson_id ? String(p.metadata.lesson_id) : null
  }))

  for (const p of mapped) {
    if (!p.lesson_id) errors.push({ paper_code: p.paper_code, message: 'Chưa gắn lesson cho mã đề này.' })
  }

  const lessonIds = Array.from(new Set(mapped.map((p) => p.lesson_id).filter(Boolean))) as string[]
  const { data: lessons } = await svc.from('lessons').select('id, title').in('id', lessonIds).limit(1000)
  const lessonById: Record<string, any> = {}
  for (const l of (lessons || []) as any[]) lessonById[String(l.id)] = l

  for (const p of mapped) {
    if (p.lesson_id && !lessonById[p.lesson_id]) {
      errors.push({ paper_code: p.paper_code, message: 'Lesson không tồn tại hoặc không truy cập được.' })
    }
  }

  const { data: questions } = lessonIds.length
    ? await svc.from('questions').select('id, lesson_id, question_type').in('lesson_id', lessonIds).limit(200000)
    : { data: [] as any[] }

  const questionsByLesson: Record<string, any[]> = {}
  for (const q of (questions || []) as any[]) {
    const lid = String(q.lesson_id || '')
    if (!lid) continue
    if (!questionsByLesson[lid]) questionsByLesson[lid] = []
    questionsByLesson[lid].push(q)
  }

  const qCountList: Array<{ lesson_id: string, count: number }> = lessonIds.map((id) => ({ lesson_id: id, count: (questionsByLesson[id] || []).length }))
  const distinctCounts = Array.from(new Set(qCountList.map((x) => x.count))).filter((n) => n > 0)
  if (distinctCounts.length > 1) {
    warnings.push({ message: 'Số câu giữa các mã đề không đồng nhất.', counts: qCountList })
  }

  for (const p of mapped) {
    if (!p.lesson_id) continue
    const qList = questionsByLesson[p.lesson_id] || []
    if (!qList.length) {
      errors.push({ paper_code: p.paper_code, message: 'Lesson chưa có câu hỏi.' })
    }
  }

  const optionQIds = (questions || []).filter((q: any) => ['single_choice', 'true_false'].includes(normalizeText(q.question_type))).map((q: any) => String(q.id))
  const tfgQIds = (questions || []).filter((q: any) => normalizeText(q.question_type) === 'true_false_group').map((q: any) => String(q.id))
  const saQIds = (questions || []).filter((q: any) => normalizeText(q.question_type) === 'short_answer').map((q: any) => String(q.id))

  const [optsRes, stRes, saRes] = await Promise.all([
    optionQIds.length ? svc.from('question_options').select('question_id, is_correct').in('question_id', optionQIds).limit(500000) : Promise.resolve({ data: [] as any[] }),
    tfgQIds.length ? svc.from('question_statements').select('question_id, correct_answer').in('question_id', tfgQIds).limit(500000) : Promise.resolve({ data: [] as any[] }),
    saQIds.length ? svc.from('question_short_answers').select('question_id, answer_text').in('question_id', saQIds).limit(500000) : Promise.resolve({ data: [] as any[] })
  ])

  const hasCorrectOption: Record<string, boolean> = {}
  for (const row of (optsRes.data || []) as any[]) {
    const qid = String(row.question_id || '')
    if (!qid) continue
    if (row.is_correct === true) hasCorrectOption[qid] = true
  }

  const allStatementsHaveCorrect: Record<string, boolean> = {}
  const tfgTotal: Record<string, number> = {}
  const tfgValid: Record<string, number> = {}
  for (const row of (stRes.data || []) as any[]) {
    const qid = String(row.question_id || '')
    if (!qid) continue
    tfgTotal[qid] = (tfgTotal[qid] || 0) + 1
    if (row.correct_answer === true || row.correct_answer === false) tfgValid[qid] = (tfgValid[qid] || 0) + 1
  }
  for (const qid of tfgQIds) {
    const total = tfgTotal[qid] || 0
    const valid = tfgValid[qid] || 0
    allStatementsHaveCorrect[qid] = total > 0 && valid === total
  }

  const hasShortAnswer: Record<string, boolean> = {}
  for (const row of (saRes.data || []) as any[]) {
    const qid = String(row.question_id || '')
    const a = normalizeText(row.answer_text)
    if (!qid) continue
    if (a) hasShortAnswer[qid] = true
  }

  const lessonIdByQuestionId: Record<string, string> = {}
  const typeByQuestionId: Record<string, string> = {}
  for (const q of (questions || []) as any[]) {
    lessonIdByQuestionId[String(q.id)] = String(q.lesson_id || '')
    typeByQuestionId[String(q.id)] = normalizeText(q.question_type)
  }

  for (const qid of optionQIds) {
    if (!hasCorrectOption[qid]) {
      const lid = lessonIdByQuestionId[qid]
      errors.push({ lesson_id: lid || null, message: 'Thiếu đáp án đúng (is_correct) cho câu trắc nghiệm.', question_id: qid })
    }
  }
  for (const qid of tfgQIds) {
    if (!allStatementsHaveCorrect[qid]) {
      const lid = lessonIdByQuestionId[qid]
      errors.push({ lesson_id: lid || null, message: 'Thiếu correct_answer cho ít nhất 1 statement (Đ/S).', question_id: qid })
    }
  }
  for (const qid of saQIds) {
    if (!hasShortAnswer[qid]) {
      const lid = lessonIdByQuestionId[qid]
      errors.push({ lesson_id: lid || null, message: 'Thiếu đáp án mẫu cho câu tự luận (short answer).', question_id: qid })
    }
  }

  const paperStatusById: Record<string, string> = {}
  for (const p of mapped) paperStatusById[p.id] = 'verifying'

  const errorsByLesson: Record<string, number> = {}
  for (const e of errors) {
    const lid = e.lesson_id ? String(e.lesson_id) : ''
    if (!lid) continue
    errorsByLesson[lid] = (errorsByLesson[lid] || 0) + 1
  }

  for (const p of mapped) {
    if (!p.lesson_id) {
      paperStatusById[p.id] = 'failed'
      continue
    }
    paperStatusById[p.id] = errorsByLesson[p.lesson_id] ? 'failed' : 'verified'
  }

  await Promise.all(mapped.map((p) => {
    return svc.from('official_exam_papers').update({ process_status: paperStatusById[p.id] }).eq('id', p.id)
  }))

  return NextResponse.json({ errors, warnings, ok: errors.length === 0 })
}
