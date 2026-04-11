import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

type SimilarRequest = {
  base_question_id?: string
  topic?: string
  topic_unit?: string
  question_type?: string
  difficulty?: string | null
  difficulty_academic?: string | null
  limit?: number
  strict?: boolean
  exclude_question_ids?: string[]
}

type PracticeQuestion = {
  question_id: string
  content: string
  question_type: string
  topic: string | null
  topic_unit: string | null
  difficulty: string | null
  difficulty_academic: string | null
  tip: string | null
  explanation: string | null
  image_url: string | null
  image_alt: string | null
  image_caption: string | null
  options?: Array<{ key: string, text: string, is_correct: boolean }>
  statements?: Array<{ statement_id: string, key: string | null, text: string, correct_answer: boolean | null, explanation: string | null, tip: string | null, sort_order: number }>
  accepted_answers?: Array<{ text: string, explanation: string | null, tip: string | null }>
}

function normalizeString(v: any): string {
  return String(v ?? '').trim()
}

function uniqStrings(arr: any[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const x of arr || []) {
    const s = normalizeString(x)
    if (!s) continue
    if (seen.has(s)) continue
    seen.add(s)
    out.push(s)
  }
  return out
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
  return arr
}

async function fetchCandidates(opts: {
  svc: ReturnType<typeof serviceRoleClient>
  topic: { topic_unit?: string | null, topic?: string | null }
  question_type?: string | null
  difficulty?: string | null
  difficulty_academic?: string | null
  excludeIds: string[]
}): Promise<Array<any>> {
  let query = opts.svc
    .from('questions')
    .select('id, lesson_id, content, question_type, topic, topic_unit, difficulty, difficulty_academic, tip, explanation, image_url, image_alt, image_caption, lessons!inner(lesson_type)')

  query = query.eq('lessons.lesson_type', 'practice')

  if (opts.topic.topic_unit) {
    query = query.eq('topic_unit', opts.topic.topic_unit)
  } else if (opts.topic.topic) {
    query = query.eq('topic', opts.topic.topic)
  } else {
    return []
  }

  if (opts.question_type) {
    query = query.eq('question_type', opts.question_type)
  }

  if (opts.difficulty != null && normalizeString(opts.difficulty)) {
    query = query.eq('difficulty', opts.difficulty)
  }

  if (opts.difficulty_academic != null && normalizeString(opts.difficulty_academic)) {
    query = query.eq('difficulty_academic', opts.difficulty_academic)
  }

  if (opts.excludeIds.length) {
    const list = `(${opts.excludeIds.map((x) => `"${x}"`).join(',')})`
    query = query.not('id', 'in', list)
  }

  const { data, error } = await query.order('id', { ascending: false }).range(0, 149)
  if (error) throw error
  return (data || []) as any[]
}

async function fetchQuestionDetails(svc: ReturnType<typeof serviceRoleClient>, questions: Array<any>): Promise<PracticeQuestion[]> {
  const ids = questions.map((q) => q.id).filter(Boolean)
  const choiceIds = questions
    .filter((q) => q.question_type === 'single_choice' || q.question_type === 'true_false')
    .map((q) => q.id)
    .filter(Boolean)
  const tfGroupIds = questions
    .filter((q) => q.question_type === 'true_false_group')
    .map((q) => q.id)
    .filter(Boolean)
  const saIds = questions
    .filter((q) => q.question_type === 'short_answer')
    .map((q) => q.id)
    .filter(Boolean)

  let optionsByQ: Record<string, Array<{ key: string, text: string, is_correct: boolean }>> = {}
  if (choiceIds.length) {
    const { data, error } = await svc
      .from('question_options')
      .select('question_id, option_key, option_text, is_correct, sort_order')
      .in('question_id', choiceIds)
      .order('sort_order', { ascending: true })
    if (error) throw error
    for (const o of (data || []) as any[]) {
      const qid = String(o.question_id || '')
      if (!qid) continue
      optionsByQ[qid] = optionsByQ[qid] || []
      optionsByQ[qid].push({
        key: normalizeString(o.option_key),
        text: normalizeString(o.option_text),
        is_correct: o.is_correct === true,
      })
    }
  }

  let statementsByQ: Record<string, PracticeQuestion['statements']> = {}
  if (tfGroupIds.length) {
    const { data, error } = await svc
      .from('question_statements')
      .select('id, question_id, statement_key, statement_text, correct_answer, explanation, tip, sort_order')
      .in('question_id', tfGroupIds)
      .order('sort_order', { ascending: true })
    if (error) throw error
    for (const s of (data || []) as any[]) {
      const qid = String(s.question_id || '')
      if (!qid) continue
      statementsByQ[qid] = statementsByQ[qid] || []
      statementsByQ[qid]!.push({
        statement_id: String(s.id || ''),
        key: s.statement_key ? String(s.statement_key) : null,
        text: normalizeString(s.statement_text),
        correct_answer: typeof s.correct_answer === 'boolean' ? s.correct_answer : null,
        explanation: s.explanation ? String(s.explanation) : null,
        tip: s.tip ? String(s.tip) : null,
        sort_order: typeof s.sort_order === 'number' ? s.sort_order : 0,
      })
    }
  }

  let acceptedByQ: Record<string, PracticeQuestion['accepted_answers']> = {}
  if (saIds.length) {
    const { data, error } = await svc
      .from('question_short_answers')
      .select('question_id, answer_text, explanation, tip')
      .in('question_id', saIds)
    if (error) throw error
    for (const a of (data || []) as any[]) {
      const qid = String(a.question_id || '')
      if (!qid) continue
      acceptedByQ[qid] = acceptedByQ[qid] || []
      acceptedByQ[qid]!.push({
        text: normalizeString(a.answer_text),
        explanation: a.explanation ? String(a.explanation) : null,
        tip: a.tip ? String(a.tip) : null,
      })
    }
  }

  const byId = new Map<string, any>(questions.map((q) => [q.id, q]))
  return ids
    .map((qid) => {
      const q = byId.get(qid)
      if (!q) return null
      const item: PracticeQuestion = {
        question_id: String(q.id),
        content: q.content ? String(q.content) : '',
        question_type: q.question_type ? String(q.question_type) : '',
        topic: q.topic ? String(q.topic) : null,
        topic_unit: q.topic_unit ? String(q.topic_unit) : null,
        difficulty: q.difficulty != null ? String(q.difficulty) : null,
        difficulty_academic: q.difficulty_academic != null ? String(q.difficulty_academic) : null,
        tip: q.tip != null ? String(q.tip) : null,
        explanation: q.explanation != null ? String(q.explanation) : null,
        image_url: q.image_url != null ? String(q.image_url) : null,
        image_alt: q.image_alt != null ? String(q.image_alt) : null,
        image_caption: q.image_caption != null ? String(q.image_caption) : null,
      }
      if (item.question_type === 'single_choice' || item.question_type === 'true_false') {
        item.options = optionsByQ[item.question_id] || []
      } else if (item.question_type === 'true_false_group') {
        item.statements = statementsByQ[item.question_id] || []
      } else if (item.question_type === 'short_answer') {
        item.accepted_answers = acceptedByQ[item.question_id] || []
      }
      return item
    })
    .filter(Boolean) as PracticeQuestion[]
}

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await req.json().catch(() => ({}))) as SimilarRequest
    const limit = Math.min(Math.max(Number(body.limit || 3) || 3, 1), 10)
    const strict = body.strict === true
    const excludeIds = uniqStrings([...(body.exclude_question_ids || []), body.base_question_id].filter(Boolean))
    const svc = serviceRoleClient()

    let seed: any = null
    if (normalizeString(body.base_question_id)) {
      const { data, error } = await svc
        .from('questions')
        .select('id, topic, topic_unit, question_type, difficulty, difficulty_academic')
        .eq('id', body.base_question_id)
        .maybeSingle()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      seed = data || null
    }

    const topic_unit = normalizeString(body.topic_unit) || normalizeString(seed?.topic_unit) || ''
    const topic = normalizeString(body.topic) || normalizeString(seed?.topic) || ''
    const topicFilter = { topic_unit: topic_unit || null, topic: topic ? topic : null }

    const question_type = normalizeString(body.question_type) || normalizeString(seed?.question_type) || ''
    const difficulty = (body.difficulty != null ? normalizeString(body.difficulty) : null) ?? (seed?.difficulty != null ? String(seed.difficulty) : null)
    const difficulty_academic = (body.difficulty_academic != null ? normalizeString(body.difficulty_academic) : null) ?? (seed?.difficulty_academic != null ? String(seed.difficulty_academic) : null)

    const strictSteps: Array<{ question_type?: string | null, difficulty?: string | null, difficulty_academic?: string | null }> = strict
      ? [
          { question_type: question_type || null, difficulty, difficulty_academic },
          { question_type: question_type || null, difficulty: null, difficulty_academic: null },
          { question_type: null, difficulty: null, difficulty_academic: null },
        ]
      : [{ question_type: question_type || null, difficulty: null, difficulty_academic: null }]

    const picked = new Map<string, any>()
    for (const step of strictSteps) {
      if (picked.size >= limit) break
      const candidates = await fetchCandidates({
        svc,
        topic: topicFilter,
        question_type: step.question_type ?? null,
        difficulty: step.difficulty ?? null,
        difficulty_academic: step.difficulty_academic ?? null,
        excludeIds: [...excludeIds, ...Array.from(picked.keys())],
      })
      shuffleInPlace(candidates)
      for (const c of candidates) {
        if (picked.size >= limit) break
        if (!c?.id) continue
        if (picked.has(c.id)) continue
        picked.set(c.id, c)
      }
    }

    const items = await fetchQuestionDetails(svc, Array.from(picked.values()))
    return NextResponse.json({ items })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
