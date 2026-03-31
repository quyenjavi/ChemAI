import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

type DifficultyAcademic = 'biet' | 'hieu' | 'van_dung' | 'van_dung_cao'
type UiQuestionType = 'single_choice' | 'true_false' | 'short_answer'
type DbQuestionType = 'single_choice' | 'true_false_group' | 'short_answer'

function mapQuestionTypeToDb(questionType: UiQuestionType): DbQuestionType {
  return questionType === 'true_false' ? 'true_false_group' : questionType
}

type ScoringConfig = {
  version?: number
  points_per_question?: Partial<Record<UiQuestionType, number>>
}

function parseUnitKey(unitKey: string): { lesson_id: string, topic_unit: string } | null {
  const raw = String(unitKey || '').trim()
  const parts = raw.split('::')
  if (parts.length !== 2) return null
  const lesson_id = String(parts[0] || '').trim()
  const encoded = String(parts[1] || '')
  if (!lesson_id) return null
  try {
    const topic_unit = decodeURIComponent(encoded)
    if (!topic_unit.trim()) return null
    return { lesson_id, topic_unit }
  } catch {
    return null
  }
}

function shuffle<T>(arr: T[]) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = a[i]
    a[i] = a[j]
    a[j] = tmp
  }
  return a
}

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const lessonIdsInput = Array.isArray(body.lesson_ids) ? body.lesson_ids : []
    const legacyLessonId = String(body.lesson_id || '').trim()
    const lesson_ids = lessonIdsInput.map((x: any) => String(x || '').trim()).filter(Boolean)
    const primary_lesson_id = lesson_ids[0] || legacyLessonId
    const grade_id = String(body.grade_id || '').trim()
    const title = String(body.title || '').trim()
    const matrix_config = body.matrix_config
    const scoring_config = (body.scoring_config || (matrix_config as any)?.scoring_config || {}) as ScoringConfig

    if (!primary_lesson_id) return NextResponse.json({ error: 'lesson_ids is required' }, { status: 400 })
    if (!grade_id) return NextResponse.json({ error: 'grade_id is required' }, { status: 400 })
    if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })
    if (!matrix_config || typeof matrix_config !== 'object') return NextResponse.json({ error: 'matrix_config is required' }, { status: 400 })

    const svc = serviceRoleClient()
    const { data: teacher } = await svc
      .from('teacher_profiles')
      .select('user_id,can_create_exam')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!teacher || !teacher.can_create_exam) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const blocks = (matrix_config as any).blocks || {}
    const uiTypes: UiQuestionType[] = ['single_choice', 'true_false', 'short_answer']
    const diffList: DifficultyAcademic[] = ['biet', 'hieu', 'van_dung', 'van_dung_cao']
    const selectedLessonIds = new Set<string>(lesson_ids.length ? lesson_ids : [primary_lesson_id])

    const requests: Array<{
      uiType: UiQuestionType
      dbType: DbQuestionType
      lesson_id: string
      topic_unit: string
      difficulty_academic: DifficultyAcademic
      quantity: number
    }> = []

    for (const uiType of uiTypes) {
      const perType = blocks[uiType] || {}
      for (const [unitKey, diffObj] of Object.entries(perType)) {
        const parsed = parseUnitKey(String(unitKey || ''))
        if (!parsed) continue
        if (!selectedLessonIds.has(parsed.lesson_id)) {
          return NextResponse.json({ error: 'Invalid unit key (lesson_id mismatch)' }, { status: 400 })
        }
        for (const d of diffList) {
          const n = Number((diffObj as any)?.[d] || 0)
          if (n > 0) {
            requests.push({
              uiType,
              dbType: mapQuestionTypeToDb(uiType),
              lesson_id: parsed.lesson_id,
              topic_unit: parsed.topic_unit,
              difficulty_academic: d,
              quantity: n
            })
          }
        }
      }
    }

    const total = requests.reduce((acc, r) => acc + r.quantity, 0)
    if (total <= 0) return NextResponse.json({ error: 'No questions requested' }, { status: 400 })

    const pointsPerQuestion: Record<UiQuestionType, number> = {
      single_choice: Number(scoring_config?.points_per_question?.single_choice ?? 0),
      true_false: Number(scoring_config?.points_per_question?.true_false ?? 0),
      short_answer: Number(scoring_config?.points_per_question?.short_answer ?? 0)
    }
    for (const k of uiTypes) {
      const v = pointsPerQuestion[k]
      if (!Number.isFinite(v) || v < 0) {
        return NextResponse.json({ error: `Invalid points_per_question for ${k}` }, { status: 400 })
      }
    }

    const sectionCounts: Record<UiQuestionType, number> = { single_choice: 0, true_false: 0, short_answer: 0 }
    for (const r of requests) sectionCounts[r.uiType] += r.quantity
    const totalScoreCents =
      sectionCounts.single_choice * Math.round(pointsPerQuestion.single_choice * 100) +
      sectionCounts.true_false * Math.round(pointsPerQuestion.true_false * 100) +
      sectionCounts.short_answer * Math.round(pointsPerQuestion.short_answer * 100)
    if (totalScoreCents !== 1000) {
      return NextResponse.json({ error: 'Total score must be 10' }, { status: 400 })
    }

    const selected: Array<{ question_id: string, order_index: number }> = []
    const used = new Set<string>()
    let order = 1

    for (const reqItem of requests) {
      const { count: availableCount, error: countErr } = await svc
        .from('questions')
        .select('id', { count: 'exact', head: true })
        .eq('lesson_id', reqItem.lesson_id)
        .eq('topic_unit', reqItem.topic_unit)
        .eq('difficulty_academic', reqItem.difficulty_academic)
        .eq('question_type', reqItem.dbType)
      if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 })
      console.log({
        lesson_id: reqItem.lesson_id,
        topic_unit: reqItem.topic_unit,
        difficulty: reqItem.difficulty_academic,
        question_type: reqItem.uiType,
        requested: reqItem.quantity,
        available: availableCount ?? 0
      })
      if ((availableCount ?? 0) < reqItem.quantity) {
        return NextResponse.json({
          error: `Not enough questions for ${reqItem.uiType} - ${reqItem.lesson_id} - ${reqItem.topic_unit} - ${reqItem.difficulty_academic}. Requested ${reqItem.quantity}, available ${availableCount ?? 0}`
        }, { status: 400 })
      }

      const ids: string[] = []
      const batch = 5000
      let offset = 0
      while (ids.length < reqItem.quantity && offset < (availableCount ?? 0)) {
        const { data: rows, error } = await svc
          .from('questions')
          .select('id')
          .eq('lesson_id', reqItem.lesson_id)
          .eq('topic_unit', reqItem.topic_unit)
          .eq('difficulty_academic', reqItem.difficulty_academic)
          .eq('question_type', reqItem.dbType)
          .order('id', { ascending: true })
          .range(offset, offset + batch - 1)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        const pageIds = (rows || [])
          .map((r: any) => r.id)
          .filter(Boolean)
          .filter((id: string) => !used.has(id))
        ids.push(...pageIds)
        if (!rows?.length) break
        offset += batch
      }
      if (ids.length < reqItem.quantity) {
        return NextResponse.json({
          error: `Not enough questions for ${reqItem.uiType} - ${reqItem.lesson_id} - ${reqItem.topic_unit} - ${reqItem.difficulty_academic}. Requested ${reqItem.quantity}, available ${ids.length}`
        }, { status: 400 })
      }
      const picked = shuffle(ids).slice(0, reqItem.quantity)
      for (const qid of picked) {
        used.add(qid)
        selected.push({ question_id: qid, order_index: order })
        order += 1
      }
    }

    const { data: exRow, error: exErr } = await svc
      .from('generated_exams')
      .insert({
        lesson_id: primary_lesson_id,
        lesson_ids: lesson_ids.length ? lesson_ids : [primary_lesson_id],
        grade_id,
        title,
        matrix_config,
        scoring_config,
        total_questions: total,
        total_score: totalScoreCents / 100,
        is_published: false,
        created_by: user.id
      })
      .select('id')
      .single()
    if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 })

    const examId = exRow.id as string
    const inserts = selected.map(s => ({ exam_id: examId, question_id: s.question_id, order_index: s.order_index }))
    const { error: insErr } = await svc.from('generated_exam_questions').insert(inserts)
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

    return NextResponse.json({ ok: true, exam_id: examId })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
