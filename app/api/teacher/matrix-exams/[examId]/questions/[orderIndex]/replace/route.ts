import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

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

export async function POST(_: Request, { params }: { params: { examId: string, orderIndex: string } }) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const orderIndex = Number(params.orderIndex)
    if (!Number.isFinite(orderIndex) || orderIndex <= 0) {
      return NextResponse.json({ error: 'Invalid orderIndex' }, { status: 400 })
    }

    const svc = serviceRoleClient()
    const { data: teacher } = await svc
      .from('teacher_profiles')
      .select('user_id,can_create_exam')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!teacher || !teacher.can_create_exam) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: ex } = await svc
      .from('generated_exams')
      .select('id,created_by,is_published')
      .eq('id', params.examId)
      .maybeSingle()
    if (!ex || (ex as any).created_by !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if ((ex as any).is_published) return NextResponse.json({ error: 'Cannot replace in published exam' }, { status: 400 })

    const { data: row, error: rowErr } = await svc
      .from('generated_exam_questions')
      .select('question_id,order_index')
      .eq('exam_id', params.examId)
      .eq('order_index', orderIndex)
      .maybeSingle()
    if (rowErr) return NextResponse.json({ error: rowErr.message }, { status: 500 })
    if (!row?.question_id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const currentQid = row.question_id as string
    const { data: q, error: qErr } = await svc
      .from('questions')
      .select('id,lesson_id,topic_unit,difficulty_academic,question_type')
      .eq('id', currentQid)
      .maybeSingle()
    if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })
    if (!q) return NextResponse.json({ error: 'Question not found' }, { status: 404 })

    const lesson_id = String((q as any).lesson_id || '').trim()
    const topic_unit = String((q as any).topic_unit || '').trim()
    const difficulty_academic = String((q as any).difficulty_academic || '').trim()
    const question_type = String((q as any).question_type || '').trim()
    if (!lesson_id || !topic_unit || !difficulty_academic || !question_type) {
      return NextResponse.json({ error: 'Question missing matrix metadata' }, { status: 400 })
    }

    const { data: usedRows, error: usedErr } = await svc
      .from('generated_exam_questions')
      .select('question_id')
      .eq('exam_id', params.examId)
    if (usedErr) return NextResponse.json({ error: usedErr.message }, { status: 500 })
    const used = new Set((usedRows || []).map((r: any) => r.question_id).filter(Boolean))
    used.delete(currentQid)

    const { count: availableCount, error: countErr } = await svc
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .eq('lesson_id', lesson_id)
      .eq('topic_unit', topic_unit)
      .eq('difficulty_academic', difficulty_academic)
      .eq('question_type', question_type)
    if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 })

    console.log({
      lesson_id,
      topic_unit,
      difficulty: difficulty_academic,
      question_type,
      requested: 1,
      available: availableCount ?? 0
    })

    if ((availableCount ?? 0) <= 1) {
      return NextResponse.json({ error: 'Không còn câu hỏi khác tương đương để đổi (không lặp)' }, { status: 400 })
    }

    const batch = 2000
    const ids: string[] = []
    let offset = 0
    while (offset < (availableCount ?? 0) && ids.length < 4000) {
      const { data: rows, error } = await svc
        .from('questions')
        .select('id')
        .eq('lesson_id', lesson_id)
        .eq('topic_unit', topic_unit)
        .eq('difficulty_academic', difficulty_academic)
        .eq('question_type', question_type)
        .order('id', { ascending: true })
        .range(offset, offset + batch - 1)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (!rows?.length) break
      for (const r of rows) {
        const id = (r as any).id
        if (id && id !== currentQid && !used.has(id)) ids.push(id)
      }
      offset += batch
    }

    if (!ids.length) {
      return NextResponse.json({ error: 'Không còn câu hỏi khác tương đương để đổi (không lặp)' }, { status: 400 })
    }

    const nextId = shuffle(ids)[0]
    const { error: upErr } = await svc
      .from('generated_exam_questions')
      .update({ question_id: nextId })
      .eq('exam_id', params.examId)
      .eq('order_index', orderIndex)
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

    return NextResponse.json({ ok: true, question_id: nextId })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
