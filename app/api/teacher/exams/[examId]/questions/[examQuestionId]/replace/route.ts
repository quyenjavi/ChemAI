import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

function pickOne(ids: string[]) {
  const i = Math.floor(Math.random() * ids.length)
  return ids[i]
}

function mapQuestionTypeToDb(questionType: string) {
  return questionType === 'true_false' ? 'true_false_group' : questionType
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

export async function POST(req: Request, { params }: { params: { examId: string, examQuestionId: string } }) {
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
      .select('id,created_by')
      .eq('id', params.examId)
      .maybeSingle()
    if (!exam || exam.created_by !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data: eqRow } = await svc
      .from('exam_questions')
      .select('id,exam_id,question_id,blueprint_item_id')
      .eq('id', params.examQuestionId)
      .eq('exam_id', params.examId)
      .maybeSingle()
    if (!eqRow) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data: bp } = await svc
      .from('exam_blueprint_items')
      .select('id,lesson_id,question_type,difficulty')
      .eq('id', eqRow.blueprint_item_id)
      .maybeSingle()
    if (!bp) return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 })

    const { data: existing } = await svc
      .from('exam_questions')
      .select('question_id')
      .eq('exam_id', params.examId)
    const used = new Set((existing || []).map((r: any) => r.question_id))

    const diffRaw = bp.difficulty
    const diffStr = diffRaw === null || diffRaw === undefined ? '' : String(diffRaw).trim()
    const diffNum = /^\d+$/.test(diffStr) ? Number(diffStr) : null
    const dbType = mapQuestionTypeToDb(String(bp.question_type))

    const tryAny = !diffStr || diffStr.toLowerCase() === 'any'
    const candidatesPool: string[] = []
    const pushUnique = (ids: string[]) => {
      for (const id of ids) {
        if (!candidatesPool.includes(id)) candidatesPool.push(id)
      }
    }

    const fetchUnused = async (diffValue: any, need: number) => {
      const countQuery = svc
        .from('questions')
        .select('id', { count: 'exact', head: true })
        .eq('lesson_id', bp.lesson_id)
        .eq('question_type', dbType)
      const countQuery2 = diffValue === undefined ? countQuery : countQuery.eq('difficulty', diffValue as any)
      const { count: totalCount, error: countErr } = await countQuery2
      if (countErr) return { totalCount: 0, ids: [] as string[] }
      console.log({
        lesson_id: bp.lesson_id,
        question_type_ui: String(bp.question_type),
        question_type_db: dbType,
        difficulty: diffValue === undefined ? null : diffValue,
        requested: need,
        available: totalCount ?? 0
      })
      if ((totalCount ?? 0) <= 0) return { totalCount: totalCount ?? 0, ids: [] as string[] }

      const batch = 2000
      const out: string[] = []
      let offset = 0
      while (out.length < need && offset < (totalCount ?? 0)) {
        const dataQuery = svc
          .from('questions')
          .select('id')
          .eq('lesson_id', bp.lesson_id)
          .eq('question_type', dbType)
          .order('id', { ascending: true })
          .range(offset, offset + batch - 1)
        const dataQuery2 = diffValue === undefined ? dataQuery : dataQuery.eq('difficulty', diffValue as any)
        const { data: rows, error } = await dataQuery2
        if (error) break
        if (!rows?.length) break
        for (const r of rows) {
          const id = (r as any).id
          if (id && !used.has(id)) out.push(id)
        }
        offset += batch
      }
      return { totalCount: totalCount ?? 0, ids: out }
    }

    if (tryAny) {
      const { ids } = await fetchUnused(undefined, 200)
      pushUnique(ids)
    } else if (diffNum) {
      for (const d of difficultySequence(diffNum)) {
        const { ids } = await fetchUnused(d as any, 100)
        pushUnique(ids)
      }
    } else {
      const { ids } = await fetchUnused(diffRaw as any, 200)
      pushUnique(ids)
    }

    if (!candidatesPool.length) return NextResponse.json({ error: 'Không còn câu hỏi khác phù hợp để đổi' }, { status: 400 })
    const nextId = pickOne(candidatesPool)

    const { error: upErr } = await svc
      .from('exam_questions')
      .update({ question_id: nextId, source_question_id: null, source_type: 'bank' })
      .eq('id', params.examQuestionId)
      .eq('exam_id', params.examId)
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
