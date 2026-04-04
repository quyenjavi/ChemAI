import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

function parseAnswerKey(text: string) {
  const s = String(text || '').trim()
  if (!s) return null
  const out: Record<string, string> = {}
  const tokens = s
    .replace(/\r/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/;/g, ' ')
    .replace(/,/g, ' ')
    .split(/\s+/)
    .map(x => x.trim())
    .filter(Boolean)
  for (const t of tokens) {
    const m = t.match(/^(\d+)([A-D])$/i)
    if (!m) continue
    out[m[1]] = m[2].toUpperCase()
  }
  return Object.keys(out).length ? out : null
}

export async function POST(req: Request, { params }: { params: { examId: string } }) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const paperId = String(body.paper_id || '').trim()
    const answersText = String(body.answers_text || '')
    if (!paperId) return NextResponse.json({ error: 'paper_id is required' }, { status: 400 })

    const answerKey = parseAnswerKey(answersText)
    if (!answerKey) return NextResponse.json({ error: 'Invalid answers_text' }, { status: 400 })

    const svc = serviceRoleClient()
    const { data: teacher } = await svc
      .from('teacher_profiles')
      .select('user_id,can_create_exam,school_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!teacher || !teacher.can_create_exam) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: exam } = await svc.from('official_exams').select('id,school_id').eq('id', params.examId).maybeSingle()
    if (!exam || exam.school_id !== teacher.school_id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data: paper } = await svc
      .from('official_exam_papers')
      .select('id,official_exam_id,is_master_source,metadata')
      .eq('id', paperId)
      .eq('official_exam_id', params.examId)
      .maybeSingle()
    if (!paper) return NextResponse.json({ error: 'Paper not found' }, { status: 404 })

    const nowIso = new Date().toISOString()
    const nextMeta = { ...(paper as any).metadata, answer_key: answerKey, answer_key_text: answersText }
    const { data: updated, error } = await svc
      .from('official_exam_papers')
      .update({ metadata: nextMeta, updated_at: nowIso } as any)
      .eq('id', paperId)
      .eq('official_exam_id', params.examId)
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    await svc
      .from('official_exam_processing_logs')
      .insert({
        official_exam_id: params.examId,
        paper_id: paperId,
        status: 'answer_key_set',
        message: `Answer key set (${Object.keys(answerKey).length} answers)`,
        created_at: nowIso,
      } as any)

    return NextResponse.json({ paper: updated })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}

