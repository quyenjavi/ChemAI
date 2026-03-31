import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

type QuestionType = 'single_choice' | 'true_false' | 'short_answer'

type BlueprintLine = {
  question_type: QuestionType
  lesson_id: string
  difficulty: string | number | null
  quantity: number
  points_per_question: number
  sort_order: number
}

function isMultipleOfQuarter(x: number) {
  const v = Math.round(x * 1000)
  return v % 250 === 0
}

function parseDifficulty(input: any) {
  if (input === null || input === undefined) return null
  const s = String(input).trim()
  if (!s) return null
  if (/^\d+$/.test(s)) return Number(s)
  return s
}

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

function typeWeight(t: string) {
  return t === 'single_choice' ? 1 : t === 'true_false' ? 2 : t === 'short_answer' ? 3 : 4
}

function pickWithoutReplacement(ids: string[], n: number) {
  const a = [...ids]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = a[i]
    a[i] = a[j]
    a[j] = tmp
  }
  return a.slice(0, n)
}

function mapQuestionTypeToDb(questionType: string) {
  return questionType === 'true_false' ? 'true_false_group' : questionType
}

async function pickQuestionsForBlueprint({
  svc,
  lessonId,
  questionType,
  difficulty,
  quantity,
  used,
}: {
  svc: any
  lessonId: string
  questionType: string
  difficulty: string | number | null
  quantity: number
  used: Set<string>
}) {
  const pick: string[] = []
  const remaining = () => quantity - pick.length
  const dbType = mapQuestionTypeToDb(questionType)

  const fetchUnused = async (diffValue: any, need: number) => {
    const countQuery = svc
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .eq('lesson_id', lessonId)
      .eq('question_type', dbType)
    const countQuery2 = diffValue === undefined ? countQuery : countQuery.eq('difficulty', diffValue as any)
    const { count: totalCount, error: countErr } = await countQuery2
    if (countErr) throw new Error(countErr.message)
    console.log({
      lesson_id: lessonId,
      question_type_ui: questionType,
      question_type_db: dbType,
      difficulty: diffValue === undefined ? null : diffValue,
      requested: need,
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
      const { data: rows, error } = await dataQuery2
      if (error) throw new Error(error.message)
      if (!rows?.length) break
      for (const r of rows) {
        const id = (r as any).id
        if (id && !used.has(id)) out.push(id)
      }
      offset += batch
    }
    return out
  }

  if (difficulty === null) {
    const ids = await fetchUnused(undefined, quantity)
    if (ids.length < quantity) return null
    const chosen = pickWithoutReplacement(ids, quantity)
    chosen.forEach(id => used.add(id))
    return chosen
  }

  const numeric = typeof difficulty === 'number' ? difficulty : (/^\d+$/.test(String(difficulty)) ? Number(difficulty) : null)
  if (!numeric) {
    const ids = await fetchUnused(difficulty as any, quantity)
    if (ids.length < quantity) return null
    const chosen = pickWithoutReplacement(ids, quantity)
    chosen.forEach(id => used.add(id))
    return chosen
  }

  for (const d of difficultySequence(numeric)) {
    if (remaining() <= 0) break
    const ids = await fetchUnused(d as any, remaining())
    if (!ids.length) continue
    const chunk = pickWithoutReplacement(ids, Math.min(ids.length, remaining()))
    chunk.forEach(id => {
      used.add(id)
      pick.push(id)
    })
  }

  if (pick.length !== quantity) return null
  return pick
}

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const title = String(body.title || '').trim()
    const description = String(body.description || '').trim()
    const grade_id = String(body.grade_id || '').trim()
    const blocks = body.blocks as any

    if (!title) return NextResponse.json({ error: 'Missing title' }, { status: 400 })
    if (!grade_id) return NextResponse.json({ error: 'Missing grade_id' }, { status: 400 })

    const svc = serviceRoleClient()
    const { data: teacher } = await svc
      .from('teacher_profiles')
      .select('user_id,can_create_exam')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!teacher || !teacher.can_create_exam) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const qTypes: QuestionType[] = ['single_choice', 'true_false', 'short_answer']
    const lines: BlueprintLine[] = []
    let totalPoints = 0
    let totalQuestions = 0

    for (const qt of qTypes) {
      const b = blocks?.[qt]
      const count = Number(b?.count || 0)
      const p = Number(b?.points_per_question || 0)
      const rows = Array.isArray(b?.items) ? b.items : []

      if (count <= 0) continue
      if (!(p > 0)) return NextResponse.json({ error: `Invalid points_per_question for ${qt}` }, { status: 400 })
      if (qt === 'single_choice' && !isMultipleOfQuarter(p)) {
        return NextResponse.json({ error: 'Single choice points_per_question must be multiple of 0.25' }, { status: 400 })
      }
      const qtySum = rows.reduce((acc: number, r: any) => acc + Number(r.quantity || 0), 0)
      if (qtySum !== count) {
        return NextResponse.json({ error: `Invalid allocation for ${qt}: ${qtySum}/${count}` }, { status: 400 })
      }

      totalQuestions += count
      totalPoints += count * p

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]
        const lesson_id = String(r.lesson_id || '').trim()
        const quantity = Number(r.quantity || 0)
        if (!lesson_id) return NextResponse.json({ error: `Missing lesson_id for ${qt}` }, { status: 400 })
        if (!(quantity > 0)) return NextResponse.json({ error: `Invalid quantity for ${qt}` }, { status: 400 })
        lines.push({
          question_type: qt,
          lesson_id,
          difficulty: parseDifficulty(r.difficulty),
          quantity,
          points_per_question: p,
          sort_order: typeWeight(qt) * 1000 + Number(r.sort_order ?? i)
        })
      }
    }

    const roundedTotal = Math.round(totalPoints * 100) / 100
    if (roundedTotal !== 10) {
      return NextResponse.json({ error: `Total points must be 10. Current: ${roundedTotal}` }, { status: 400 })
    }
    if (totalQuestions <= 0) return NextResponse.json({ error: 'No questions' }, { status: 400 })

    const { data: examRow, error: examErr } = await svc
      .from('exams')
      .insert({
        title,
        description: description || null,
        grade_id,
        created_by: user.id,
        status: 'draft',
        source_type: 'standard',
        total_questions: 0
      })
      .select('id')
      .single()
    if (examErr) return NextResponse.json({ error: examErr.message }, { status: 500 })

    const examId = examRow.id as string

    const blueprintInsert = lines
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((l, idx) => ({
        exam_id: examId,
        question_type: l.question_type,
        lesson_id: l.lesson_id,
        difficulty: l.difficulty === null ? null : String(l.difficulty),
        quantity: l.quantity,
        points_per_question: l.points_per_question,
        sort_order: idx
      }))

    const { data: bpRows, error: bpErr } = await svc
      .from('exam_blueprint_items')
      .insert(blueprintInsert)
      .select('id,question_type,lesson_id,difficulty,quantity,points_per_question,sort_order')
    if (bpErr) return NextResponse.json({ error: bpErr.message }, { status: 500 })

    const lessonIds = Array.from(new Set((bpRows || []).map((b: any) => b.lesson_id).filter(Boolean)))
    const { data: lessonRows } = lessonIds.length
      ? await svc.from('lessons').select('id,title').in('id', lessonIds)
      : { data: [] as any[] }
    const lessonTitleById = new Map((lessonRows || []).map((l: any) => [l.id, l.title]))

    const used = new Set<string>()
    const examQuestions: Array<any> = []
    let order = 1

    for (const bp of (bpRows || []).sort((a: any, b: any) => Number(a.sort_order) - Number(b.sort_order))) {
      const lessonId = String(bp.lesson_id)
      const qt = String(bp.question_type)
      const diff = bp.difficulty
      const picked = await pickQuestionsForBlueprint({
        svc,
        lessonId,
        questionType: qt,
        difficulty: diff === null || diff === undefined || String(diff).trim() === '' || String(diff).toLowerCase() === 'any' ? null : diff,
        quantity: Number(bp.quantity),
        used
      })
      if (!picked) {
        const lessonTitle = lessonTitleById.get(lessonId) || lessonId
        return NextResponse.json({
          error: `Không đủ câu hỏi cho yêu cầu: ${qt} - ${lessonTitle} - ${diff ?? 'any'}`
        }, { status: 400 })
      }
      for (const qid of picked) {
        examQuestions.push({
          exam_id: examId,
          blueprint_item_id: bp.id,
          question_id: qid,
          question_order: order,
          points: bp.points_per_question,
          source_type: 'bank',
          source_question_id: null
        })
        order += 1
      }
    }

    const { error: insEQErr } = await svc.from('exam_questions').insert(examQuestions)
    if (insEQErr) return NextResponse.json({ error: insEQErr.message }, { status: 500 })

    await svc.from('exams').update({ total_questions: totalQuestions }).eq('id', examId)

    return NextResponse.json({ ok: true, exam_id: examId })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
