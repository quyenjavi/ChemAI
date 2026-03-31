import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'
import { env } from '@/lib/env'

type QuestionType = 'single_choice' | 'true_false' | 'short_answer'

function difficultySequence(target: number) {
  const t = Math.max(1, Math.min(4, target))
  const seq: number[] = [t]
  for (let d = 1; d <= 3; d++) {
    const a = t - d
    const b = t + d
    if (a >= 1) seq.push(a)
    if (b <= 4) seq.push(b)
  }
  return Array.from(new Set(seq))
}

function pickOne(ids: string[]) {
  const i = Math.floor(Math.random() * ids.length)
  return ids[i]
}

async function callOpenAI(prompt: string) {
  const res = await fetch(`${env.openaiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.openaiApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: env.openaiModel,
      messages: [
        { role: 'system', content: 'Chỉ trả về JSON hợp lệ, không kèm markdown.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.5
    })
  })
  if (!res.ok) throw new Error(`OpenAI error: ${res.status} ${await res.text()}`)
  const json = await res.json()
  return String(json?.choices?.[0]?.message?.content || '')
}

function parseJson(text: string) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function getQuestionFull(svc: any, questionId: string) {
  const { data: q } = await svc.from('questions').select('*').eq('id', questionId).maybeSingle()
  if (!q) return null
  const qt = String(q.question_type || '')
  const { data: opts } = await svc.from('question_options').select('*').eq('question_id', questionId).order('sort_order', { ascending: true })
  const { data: st } = await svc.from('question_statements').select('*').eq('question_id', questionId).order('sort_order', { ascending: true })
  const { data: sa } = await svc.from('question_short_answers').select('*').eq('question_id', questionId)
  return { q, qt, opts: opts || [], st: st || [], sa: sa || [] }
}

async function pickFromBank({
  svc,
  lessonId,
  questionType,
  targetDifficulty,
  used,
  exclude,
}: {
  svc: any
  lessonId: string
  questionType: string
  targetDifficulty: string | null
  used: Set<string>
  exclude: Set<string>
}) {
  const dbType = questionType === 'true_false' ? 'true_false_group' : questionType
  const diffStr = targetDifficulty ? String(targetDifficulty).trim() : ''
  const diffNum = /^\d+$/.test(diffStr) ? Number(diffStr) : null
  const tryAny = !diffStr || diffStr.toLowerCase() === 'any'
  const pool: string[] = []
  const push = (ids: string[]) => {
    for (const id of ids) {
      if (!pool.includes(id)) pool.push(id)
    }
  }

  const fetchUnused = async (diffValue: any, need: number) => {
    const countQuery = svc
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .eq('lesson_id', lessonId)
      .eq('question_type', dbType)
    const countQuery2 = diffValue === undefined ? countQuery : countQuery.eq('difficulty', diffValue as any)
    const { count: totalCount } = await countQuery2
    console.log({
      lesson_id: lessonId,
      question_type_ui: questionType,
      question_type_db: dbType,
      difficulty: diffValue === undefined ? null : diffValue,
      requested: 1,
      available: totalCount ?? 0
    })
    if ((totalCount ?? 0) <= 0) return []

    const batch = 2000
    const out: string[] = []
    let offset = 0
    while (out.length < need && offset < (totalCount ?? 0)) {
      const dataQuery = svc
        .from('questions')
        .select('id')
        .eq('lesson_id', lessonId)
        .eq('question_type', dbType)
        .order('id', { ascending: true })
        .range(offset, offset + batch - 1)
      const dataQuery2 = diffValue === undefined ? dataQuery : dataQuery.eq('difficulty', diffValue as any)
      const { data: rows } = await dataQuery2
      if (!rows?.length) break
      for (const r of rows) {
        const id = (r as any).id
        if (id && !used.has(id) && !exclude.has(id)) out.push(id)
      }
      offset += batch
    }
    return out
  }

  if (tryAny) {
    push(await fetchUnused(undefined, 200))
  } else if (diffNum) {
    for (const d of difficultySequence(diffNum)) {
      push(await fetchUnused(d as any, 100))
    }
  } else {
    push(await fetchUnused(targetDifficulty as any, 200))
  }

  const available = pool.filter(id => !used.has(id) && !exclude.has(id))
  if (!available.length) return null
  const id = pickOne(available)
  used.add(id)
  return id
}

async function insertAiQuestion({
  svc,
  lessonId,
  questionType,
  difficulty,
  points,
  sourceQuestionId,
  seed,
}: {
  svc: any
  lessonId: string
  questionType: QuestionType
  difficulty: any
  points: number
  sourceQuestionId: string
  seed: any
}) {
  const finalDifficulty = difficulty === null || difficulty === undefined || String(difficulty).trim() === '' || String(difficulty).toLowerCase() === 'any'
    ? null
    : difficulty
  const prompt = (() => {
    if (questionType === 'single_choice') {
      return `Bạn là giáo viên Hóa học. Hãy tạo một câu trắc nghiệm 4 đáp án (A,B,C,D) tương đương về mục tiêu kiến thức nhưng khác dữ kiện/ ngữ cảnh so với câu gốc. 
Yêu cầu trả về JSON: { content, options:[{key,text,is_correct}], tip, explanation }.
Câu gốc: ${seed.q.content}
Đáp án đúng hiện tại: ${(seed.opts || []).find((o: any) => o.is_correct)?.option_key || ''}
Độ khó mục tiêu: ${finalDifficulty ?? 'any'}
Điểm: ${points}`
    }
    if (questionType === 'true_false') {
      return `Bạn là giáo viên Hóa học. Hãy tạo một câu dạng Đúng/Sai nhiều mệnh đề (true_false_group) tương đương mục tiêu kiến thức nhưng khác dữ kiện/ngữ cảnh.
Yêu cầu trả về JSON: { content, statements:[{key,text,correct_answer,score?,tip?,explanation?}], tip, explanation }.
Câu gốc: ${seed.q.content}
Mệnh đề gốc:\n${(seed.st || []).map((s: any) => `${s.statement_key || ''}. ${s.statement_text || ''} (đúng=${s.correct_answer === true ? 'true' : 'false'})`).join('\n')}
Độ khó mục tiêu: ${finalDifficulty ?? 'any'}
Điểm: ${points}`
    }
    return `Bạn là giáo viên Hóa học. Hãy tạo câu trả lời ngắn tương đương về mục tiêu kiến thức nhưng khác dữ kiện/ ngữ cảnh so với câu gốc.
Yêu cầu trả về JSON: { content, accepted_answers:[string], tip, explanation }.
Câu gốc: ${seed.q.content}
Độ khó mục tiêu: ${finalDifficulty ?? 'any'}
Điểm: ${points}`
  })()

  const raw = await callOpenAI(prompt)
  const parsed = parseJson(raw)
  if (!parsed || typeof parsed !== 'object') throw new Error('AI output invalid JSON')

  const content = String((parsed as any).content || '').trim()
  const tip = String((parsed as any).tip || '').trim()
  const explanation = String((parsed as any).explanation || '').trim()
  if (!content) throw new Error('AI output missing content')
  if (questionType === 'single_choice') {
    const opts = Array.isArray((parsed as any).options) ? (parsed as any).options : []
    const correctCount = opts.filter((o: any) => o?.is_correct === true).length
    if (opts.length < 4 || correctCount !== 1) throw new Error('AI output invalid options for single_choice')
  }
  if (questionType === 'true_false') {
    const st = Array.isArray((parsed as any).statements) ? (parsed as any).statements : []
    if (!st.length) throw new Error('AI output missing statements for true_false_group')
  }
  if (questionType === 'short_answer') {
    const aa = Array.isArray((parsed as any).accepted_answers) ? (parsed as any).accepted_answers : []
    if (!aa.length) throw new Error('AI output missing accepted_answers for short_answer')
  }

  const { data: qRow, error: qErr } = await svc
    .from('questions')
    .insert({
      lesson_id: lessonId,
      content,
      question_type: questionType === 'true_false' ? 'true_false_group' : questionType,
      difficulty: finalDifficulty,
      exam_score: points,
      tip: tip || null,
      explanation: explanation || null,
      review_status: 'normal',
      resolution_type: 'none',
      report_locked: false
    })
    .select('id')
    .single()
  if (qErr) throw new Error(qErr.message)

  const newQid = qRow.id as string

  if (questionType === 'single_choice') {
    const opts = Array.isArray((parsed as any).options) ? (parsed as any).options : []
    const mapped = opts
      .map((o: any, idx: number) => ({
        question_id: newQid,
        option_key: String(o.key || '').trim(),
        option_text: String(o.text || '').trim(),
        is_correct: o.is_correct === true,
        sort_order: idx
      }))
      .filter((o: any) => o.option_key && o.option_text)
    if (mapped.length) {
      const { error } = await svc.from('question_options').insert(mapped)
      if (error) throw new Error(error.message)
    }
  } else if (questionType === 'true_false') {
    const st = Array.isArray((parsed as any).statements) ? (parsed as any).statements : []
    const mapped = st.map((s: any, idx: number) => ({
      question_id: newQid,
      statement_key: String(s.key || '').trim(),
      statement_text: String(s.text || '').trim(),
      correct_answer: s.correct_answer === true,
      score: typeof s.score === 'number' ? s.score : 0.25,
      sort_order: idx,
      explanation: String(s.explanation || ''),
      tip: String(s.tip || '')
    })).filter((x: any) => x.statement_text)
    const { error } = await svc.from('question_statements').insert(mapped)
    if (error) throw new Error(error.message)
  } else if (questionType === 'short_answer') {
    const aa = Array.isArray((parsed as any).accepted_answers) ? (parsed as any).accepted_answers : []
    const mapped = aa.map((t: any) => ({
      question_id: newQid,
      answer_text: String(t || '').trim(),
      score: 1,
      explanation: '',
      tip: ''
    })).filter((x: any) => x.answer_text)
    const { error } = await svc.from('question_short_answers').insert(mapped)
    if (error) throw new Error(error.message)
  }

  return { id: newQid, source_question_id: sourceQuestionId }
}

export async function POST(_: Request, { params }: { params: { examId: string } }) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const svc = serviceRoleClient()
    const { data: teacher } = await svc
      .from('teacher_profiles')
      .select('user_id,can_create_exam')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!teacher || !teacher.can_create_exam) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: exam } = await svc
      .from('exams')
      .select('*')
      .eq('id', params.examId)
      .maybeSingle()
    if (!exam || exam.created_by !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data: bpOld } = await svc
      .from('exam_blueprint_items')
      .select('*')
      .eq('exam_id', params.examId)
      .order('sort_order', { ascending: true })
    const { data: eqOld } = await svc
      .from('exam_questions')
      .select('*')
      .eq('exam_id', params.examId)
      .order('question_order', { ascending: true })

    const { data: newExam, error: newExamErr } = await svc
      .from('exams')
      .insert({
        title: `${exam.title} (AI)`,
        description: exam.description || null,
        grade_id: exam.grade_id,
        created_by: user.id,
        source_type: 'ai_variant',
        parent_exam_id: exam.id,
        status: 'draft',
        total_questions: 0
      })
      .select('id')
      .single()
    if (newExamErr) return NextResponse.json({ error: newExamErr.message }, { status: 500 })

    const newExamId = newExam.id as string
    const bpInsert = (bpOld || []).map((b: any) => ({
      exam_id: newExamId,
      question_type: b.question_type,
      lesson_id: b.lesson_id,
      difficulty: b.difficulty,
      quantity: b.quantity,
      points_per_question: b.points_per_question,
      sort_order: b.sort_order
    }))
    const { data: bpNew, error: bpErr } = await svc.from('exam_blueprint_items').insert(bpInsert).select('id,lesson_id,question_type,difficulty,points_per_question,sort_order')
    if (bpErr) return NextResponse.json({ error: bpErr.message }, { status: 500 })

    const bpMap = new Map<string, any>()
    for (const row of (bpNew || [])) {
      const key = `${row.lesson_id}|${row.question_type}|${row.difficulty ?? ''}|${row.points_per_question}|${row.sort_order}`
      bpMap.set(key, row)
    }

    const used = new Set<string>()
    const exclude = new Set((eqOld || []).map((r: any) => r.question_id))
    const inserts: any[] = []

    for (const oldEq of (eqOld || [])) {
      const oldBp = (bpOld || []).find((b: any) => b.id === oldEq.blueprint_item_id)
      if (!oldBp) return NextResponse.json({ error: 'Blueprint mismatch' }, { status: 500 })
      const key = `${oldBp.lesson_id}|${oldBp.question_type}|${oldBp.difficulty ?? ''}|${oldBp.points_per_question}|${oldBp.sort_order}`
      const mappedBp = bpMap.get(key)
      if (!mappedBp) return NextResponse.json({ error: 'Blueprint mapping failed' }, { status: 500 })

      const picked = await pickFromBank({
        svc,
        lessonId: oldBp.lesson_id,
        questionType: oldBp.question_type,
        targetDifficulty: oldBp.difficulty === null || oldBp.difficulty === undefined ? null : String(oldBp.difficulty),
        used,
        exclude
      })

      if (picked) {
        inserts.push({
          exam_id: newExamId,
          blueprint_item_id: mappedBp.id,
          question_id: picked,
          question_order: oldEq.question_order,
          points: oldEq.points,
          source_type: 'bank',
          source_question_id: null
        })
        continue
      }

      const seed = await getQuestionFull(svc, oldEq.question_id)
      if (!seed) return NextResponse.json({ error: 'Source question not found' }, { status: 500 })
      const qType = String(oldBp.question_type) as QuestionType
      const ai = await insertAiQuestion({
        svc,
        lessonId: oldBp.lesson_id,
        questionType: qType,
        difficulty: oldBp.difficulty,
        points: Number(oldEq.points || oldBp.points_per_question || 1),
        sourceQuestionId: oldEq.question_id,
        seed
      })
      used.add(ai.id)
      inserts.push({
        exam_id: newExamId,
        blueprint_item_id: mappedBp.id,
        question_id: ai.id,
        question_order: oldEq.question_order,
        points: oldEq.points,
        source_type: 'ai_variant',
        source_question_id: ai.source_question_id
      })
    }

    const { error: insErr } = await svc.from('exam_questions').insert(inserts)
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
    await svc.from('exams').update({ total_questions: inserts.length }).eq('id', newExamId)

    return NextResponse.json({ ok: true, exam_id: newExamId })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
