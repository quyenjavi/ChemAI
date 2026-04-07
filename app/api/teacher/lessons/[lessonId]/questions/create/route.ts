import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

function normalizeDifficulty(v: any) {
  const s = String(v || '').trim()
  const ok = new Set(['biet', 'hieu', 'van_dung', 'van_dung_cao'])
  return ok.has(s) ? s : null
}

export async function POST(req: Request, { params }: { params: { lessonId: string } }) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const question_type = String(body.question_type || '').trim()
    const content = String(body.content || '').trim()
    const tip = body.tip == null ? null : String(body.tip || '')
    const explanation = body.explanation == null ? null : String(body.explanation || '')
    const image_url = body.image_url == null ? null : String(body.image_url || '').trim() || null
    const exam_score = body.exam_score == null ? null : Number(body.exam_score)
    const topic_unit = body.topic_unit == null ? null : String(body.topic_unit || '').trim() || null
    const difficulty_academic = normalizeDifficulty(body.difficulty_academic)

    if (!question_type) return NextResponse.json({ error: 'question_type is required' }, { status: 400 })
    if (!content) return NextResponse.json({ error: 'content is required' }, { status: 400 })

    const svc = serviceRoleClient()
    const { data: teacher } = await svc.from('teacher_profiles').select('id').eq('user_id', user.id).maybeSingle()
    if (!teacher) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const nowIso = new Date().toISOString()
    const { data: created, error } = await svc
      .from('questions')
      .insert({
        lesson_id: params.lessonId,
        question_type,
        content,
        tip,
        explanation,
        image_url,
        exam_score: isFinite(exam_score as any) ? exam_score : null,
        topic_unit,
        difficulty_academic,
        topic: topic_unit,
        created_at: nowIso,
        updated_at: nowIso,
        report_count: 0,
        report_locked: false,
        review_status: 'normal',
        resolution_type: 'none',
      } as any)
      .select('*')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    const qid = created.id

    if (question_type === 'single_choice') {
      const options = Array.isArray(body.options) ? body.options : []
      const rows = options.map((o: any, idx: number) => ({
        question_id: qid,
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

    if (question_type === 'true_false_group') {
      const statements = Array.isArray(body.statements) ? body.statements : []
      const seen = new Set<string>()
      for (const s of statements) {
        const k = String(s?.statement_key || '').trim().toLowerCase()
        if (!k) continue
        if (seen.has(k)) return NextResponse.json({ error: `Duplicate statement_key: ${k}` }, { status: 400 })
        seen.add(k)
      }
      const rows = statements.map((s: any, idx: number) => ({
        question_id: qid,
        statement_key: String(s.statement_key || '').trim().toLowerCase(),
        statement_text: String(s.content || '').trim(),
        correct_answer: s.correct_answer === true,
        score: s.score == null ? null : Number(s.score),
        explanation: s.explanation == null ? null : String(s.explanation || ''),
        tip: s.tip == null ? null : String(s.tip || ''),
        sort_order: idx + 1,
        created_at: nowIso,
      })).filter((s: any) => s.statement_key && s.statement_text)
      if (rows.length) {
        const ins = await svc.from('question_statements').insert(rows as any)
        if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 400 })
      }
    }

    if (question_type === 'short_answer') {
      const answers = Array.isArray(body.short_answers) ? body.short_answers : []
      const rows = answers.map((a: any) => ({
        question_id: qid,
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

    return NextResponse.json({ question: created })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
