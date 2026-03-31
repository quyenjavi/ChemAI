import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'
import { env } from '@/lib/env'

type QuestionType = 'single_choice' | 'true_false' | 'short_answer'

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
      temperature: 0.6
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
  const { data: opts } = await svc.from('question_options').select('*').eq('question_id', questionId).order('sort_order', { ascending: true })
  const { data: st } = await svc.from('question_statements').select('*').eq('question_id', questionId).order('sort_order', { ascending: true })
  const { data: sa } = await svc.from('question_short_answers').select('*').eq('question_id', questionId)
  return { q, opts: opts || [], st: st || [], sa: sa || [] }
}

export async function POST(_: Request, { params }: { params: { examId: string, examQuestionId: string } }) {
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

    const { data: exam } = await svc.from('exams').select('id,created_by').eq('id', params.examId).maybeSingle()
    if (!exam || exam.created_by !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data: eqRow } = await svc
      .from('exam_questions')
      .select('id,exam_id,question_id,blueprint_item_id,question_order,points')
      .eq('id', params.examQuestionId)
      .eq('exam_id', params.examId)
      .maybeSingle()
    if (!eqRow) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data: bp } = await svc
      .from('exam_blueprint_items')
      .select('id,lesson_id,question_type,difficulty,points_per_question')
      .eq('id', eqRow.blueprint_item_id)
      .maybeSingle()
    if (!bp) return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 })

    const seed = await getQuestionFull(svc, eqRow.question_id)
    if (!seed) return NextResponse.json({ error: 'Source question not found' }, { status: 500 })

    const questionType = String(bp.question_type) as QuestionType
    const points = Number(eqRow.points || bp.points_per_question || 1)
    const finalDifficulty = bp.difficulty === null || bp.difficulty === undefined || String(bp.difficulty).trim() === '' || String(bp.difficulty).toLowerCase() === 'any'
      ? null
      : bp.difficulty
    const prompt = (() => {
      if (questionType === 'single_choice') {
        return `Bạn là giáo viên Hóa học. Hãy tạo một câu trắc nghiệm 4 đáp án (A,B,C,D) tương đương về mục tiêu kiến thức nhưng khác dữ kiện/ngữ cảnh.
Trả JSON: { content, options:[{key,text,is_correct}], tip, explanation }.
Câu gốc: ${seed.q.content}
Đáp án đúng hiện tại: ${(seed.opts || []).find((o: any) => o.is_correct)?.option_key || ''}
Độ khó mục tiêu: ${finalDifficulty ?? 'any'}
Điểm: ${points}`
      }
      if (questionType === 'true_false') {
        return `Bạn là giáo viên Hóa học. Hãy tạo một câu dạng Đúng/Sai nhiều mệnh đề (true_false_group) tương đương mục tiêu kiến thức nhưng khác dữ kiện/ngữ cảnh.
Trả JSON: { content, statements:[{key,text,correct_answer,score?,tip?,explanation?}], tip, explanation }.
Câu gốc: ${seed.q.content}
Mệnh đề gốc:\n${(seed.st || []).map((s: any) => `${s.statement_key || ''}. ${s.statement_text || ''} (đúng=${s.correct_answer === true ? 'true' : 'false'})`).join('\n')}
Độ khó mục tiêu: ${finalDifficulty ?? 'any'}
Điểm: ${points}`
      }
      return `Bạn là giáo viên Hóa học. Hãy tạo câu trả lời ngắn tương đương về mục tiêu kiến thức nhưng khác dữ kiện/ngữ cảnh.
Trả JSON: { content, accepted_answers:[string], tip, explanation }.
Câu gốc: ${seed.q.content}
Độ khó mục tiêu: ${finalDifficulty ?? 'any'}
Điểm: ${points}`
    })()

    const raw = await callOpenAI(prompt)
    const parsed = parseJson(raw)
    if (!parsed || typeof parsed !== 'object') return NextResponse.json({ error: 'AI output invalid JSON' }, { status: 500 })

    const content = String((parsed as any).content || '').trim()
    const tip = String((parsed as any).tip || '').trim()
    const explanation = String((parsed as any).explanation || '').trim()
    if (!content) return NextResponse.json({ error: 'AI output missing content' }, { status: 500 })
    if (questionType === 'single_choice') {
      const opts = Array.isArray((parsed as any).options) ? (parsed as any).options : []
      const correctCount = opts.filter((o: any) => o?.is_correct === true).length
      if (opts.length < 4 || correctCount !== 1) return NextResponse.json({ error: 'AI output invalid options for single_choice' }, { status: 500 })
    }
    if (questionType === 'true_false') {
      const st = Array.isArray((parsed as any).statements) ? (parsed as any).statements : []
      if (!st.length) return NextResponse.json({ error: 'AI output missing statements for true_false_group' }, { status: 500 })
    }
    if (questionType === 'short_answer') {
      const aa = Array.isArray((parsed as any).accepted_answers) ? (parsed as any).accepted_answers : []
      if (!aa.length) return NextResponse.json({ error: 'AI output missing accepted_answers for short_answer' }, { status: 500 })
    }

    const { data: qRow, error: qErr } = await svc
      .from('questions')
      .insert({
        lesson_id: bp.lesson_id,
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
    if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })
    const newQid = qRow.id as string

    if (questionType === 'single_choice') {
      const opts = Array.isArray((parsed as any).options) ? (parsed as any).options : []
      const mapped = opts.map((o: any, idx: number) => ({
        question_id: newQid,
        option_key: String(o.key || '').trim(),
        option_text: String(o.text || '').trim(),
        is_correct: o.is_correct === true,
        sort_order: idx
      })).filter((o: any) => o.option_key && o.option_text)
      if (mapped.length) {
        const { error } = await svc.from('question_options').insert(mapped)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
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
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
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
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const { error: upErr } = await svc
      .from('exam_questions')
      .update({ question_id: newQid, source_type: 'ai_variant', source_question_id: eqRow.question_id })
      .eq('id', params.examQuestionId)
      .eq('exam_id', params.examId)
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
