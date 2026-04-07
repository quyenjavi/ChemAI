import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

function normalizeDifficulty(v: any) {
  const s = String(v || '').trim()
  const ok = new Set(['biet', 'hieu', 'van_dung', 'van_dung_cao'])
  return ok.has(s) ? s : null
}

export async function POST(req: Request, { params }: { params: { lessonId: string, questionId: string } }) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const content = body.content == null ? undefined : String(body.content || '').trim()
    const tip = body.tip == null ? undefined : String(body.tip || '')
    const explanation = body.explanation == null ? undefined : String(body.explanation || '')
    const image_url = body.image_url == null ? undefined : String(body.image_url || '').trim() || null
    const exam_score = body.exam_score == null ? undefined : Number(body.exam_score)
    const topic_unit = body.topic_unit == null ? undefined : String(body.topic_unit || '').trim() || null
    const difficulty_academic = body.difficulty_academic == null ? undefined : normalizeDifficulty(body.difficulty_academic)

    const svc = serviceRoleClient()
    const { data: teacher } = await svc.from('teacher_profiles').select('id').eq('user_id', user.id).maybeSingle()
    if (!teacher) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: q } = await svc
      .from('questions')
      .select('id,lesson_id,question_type')
      .eq('id', params.questionId)
      .eq('lesson_id', params.lessonId)
      .maybeSingle()
    if (!q) return NextResponse.json({ error: 'Question not found' }, { status: 404 })

    const nowIso = new Date().toISOString()
    const patch: any = { updated_at: nowIso }
    if (content !== undefined) {
      if (!content) return NextResponse.json({ error: 'content is required' }, { status: 400 })
      patch.content = content
    }
    if (tip !== undefined) patch.tip = tip
    if (explanation !== undefined) patch.explanation = explanation
    if (image_url !== undefined) patch.image_url = image_url
    if (exam_score !== undefined) patch.exam_score = isFinite(exam_score as any) ? exam_score : null
    if (topic_unit !== undefined) {
      patch.topic_unit = topic_unit
      patch.topic = topic_unit
    }
    if (difficulty_academic !== undefined) {
      patch.difficulty_academic = difficulty_academic
    }

    const upd = await svc.from('questions').update(patch).eq('id', params.questionId).eq('lesson_id', params.lessonId).select('*').single()
    if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 400 })

    const questionType = String((q as any).question_type || '')

    if (body.options !== undefined && questionType === 'single_choice') {
      await svc.from('question_options').delete().eq('question_id', params.questionId)
      const options = Array.isArray(body.options) ? body.options : []
      const rows = options.map((o: any, idx: number) => ({
        question_id: params.questionId,
        option_key: String(o.option_key || '').trim(),
        option_text: String(o.content || '').trim(),
        is_correct: !!o.is_correct,
        sort_order: idx + 1,
        created_at: nowIso,
      })).filter((o: any) => o.option_key && o.option_text)
      if (rows.length) {
        const ins = await svc.from('question_options').insert(rows as any)
        if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 400 })
      }
    }

    if (body.statements !== undefined && questionType === 'true_false_group') {
      const statements = Array.isArray(body.statements) ? body.statements : []
      const normalized = statements.map((s: any, idx: number) => {
        const statement_id = s.statement_id == null ? null : String(s.statement_id || '').trim() || null
        const statement_key = String(s.statement_key || '').trim().toLowerCase()
        const statement_text = String(s.content || '').trim()
        const correct_answer = (s.correct_answer === true) ? true : (s.correct_answer === false) ? false : null
        const score = s.score == null ? null : Number(s.score)
        const explanation = s.explanation == null ? null : String(s.explanation || '')
        const tip = s.tip == null ? null : String(s.tip || '')
        return { statement_id, statement_key, statement_text, correct_answer, score: isFinite(score as any) ? score : null, explanation, tip, sort_order: idx + 1 }
      })

      const seenKeys = new Set<string>()
      for (const s of normalized) {
        if (!s.statement_key) return NextResponse.json({ error: 'statement_key is required' }, { status: 400 })
        if (seenKeys.has(s.statement_key)) return NextResponse.json({ error: `Duplicate statement_key: ${s.statement_key}` }, { status: 400 })
        seenKeys.add(s.statement_key)
        if (s.statement_text && s.correct_answer == null) {
          return NextResponse.json({ error: `correct_answer is required for statement_key ${s.statement_key}` }, { status: 400 })
        }
      }

      const { data: existingSt, error: exErr } = await svc
        .from('question_statements')
        .select('id, question_id, statement_key')
        .eq('question_id', params.questionId)
        .limit(2000)
      if (exErr) return NextResponse.json({ error: exErr.message }, { status: 400 })

      const existingIds = new Set<string>((existingSt || []).map((r: any) => String(r.id)))
      const existingByKey: Record<string, string> = {}
      for (const r of (existingSt || []) as any[]) {
        const k = String(r.statement_key || '').trim().toLowerCase()
        if (!k) continue
        existingByKey[k] = String(r.id)
      }

      const keepIds: string[] = []
      const deleteCandidates: string[] = []

      for (const s of normalized) {
        const key = s.statement_key
        const desiredId = s.statement_id
        const fallbackId = existingByKey[key] || null
        const targetId = desiredId || fallbackId

        if (s.statement_text) {
          if (desiredId && !existingIds.has(desiredId)) {
            return NextResponse.json({ error: `Invalid statement_id for key ${key}` }, { status: 400 })
          }

          if (targetId) {
            keepIds.push(targetId)
            const updSt = await svc
              .from('question_statements')
              .update({
                statement_key: key,
                statement_text: s.statement_text,
                correct_answer: s.correct_answer,
                score: s.score,
                explanation: s.explanation,
                tip: s.tip,
                sort_order: s.sort_order,
              } as any)
              .eq('id', targetId)
              .eq('question_id', params.questionId)
            if (updSt.error) return NextResponse.json({ error: updSt.error.message }, { status: 400 })
          } else {
            const insSt = await svc
              .from('question_statements')
              .insert({
                question_id: params.questionId,
                statement_key: key,
                statement_text: s.statement_text,
                correct_answer: s.correct_answer,
                score: s.score,
                explanation: s.explanation,
                tip: s.tip,
                sort_order: s.sort_order,
                created_at: nowIso,
              } as any)
              .select('id')
              .single()
            if (insSt.error) return NextResponse.json({ error: insSt.error.message }, { status: 400 })
            keepIds.push(String(insSt.data.id))
          }
        } else if (targetId) {
          deleteCandidates.push(targetId)
        }
      }

      const uniqueDelete = Array.from(new Set(deleteCandidates.filter((id) => !keepIds.includes(id))))
      for (const id of uniqueDelete) {
        const { data: refs, error: refErr } = await svc
          .from('quiz_attempt_answers')
          .select('id')
          .eq('statement_id', id)
          .limit(1)
        if (refErr) return NextResponse.json({ error: refErr.message }, { status: 400 })
        if (refs && refs.length > 0) {
          return NextResponse.json({ error: 'Không thể xóa statement vì đang được tham chiếu trong quiz_attempt_answers', statement_id: id }, { status: 400 })
        }
        const del = await svc.from('question_statements').delete().eq('id', id).eq('question_id', params.questionId)
        if (del.error) return NextResponse.json({ error: del.error.message }, { status: 400 })
      }
    }

    if (body.short_answers !== undefined && questionType === 'short_answer') {
      await svc.from('question_short_answers').delete().eq('question_id', params.questionId)
      const answers = Array.isArray(body.short_answers) ? body.short_answers : []
      const rows = answers.map((a: any) => ({
        question_id: params.questionId,
        answer_text: String(a.content || '').trim(),
        score: a.score == null ? null : Number(a.score),
        explanation: a.explanation == null ? null : String(a.explanation || ''),
        tip: a.tip == null ? null : String(a.tip || ''),
        created_at: nowIso,
      })).filter((a: any) => a.answer_text)
      if (rows.length) {
        const ins = await svc.from('question_short_answers').insert(rows as any)
        if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 400 })
      }
    }

    return NextResponse.json({ question: upd.data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
