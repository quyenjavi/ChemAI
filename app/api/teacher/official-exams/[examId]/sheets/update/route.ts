import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

function parseAnswerText(text: string) {
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
    const sheetId = String(body.sheet_id || '').trim()
    const studentId = body.student_id == null ? null : String(body.student_id || '').trim() || null
    const paperId = body.paper_id == null ? null : String(body.paper_id || '').trim() || null
    const detectedStudentCode = body.detected_student_code == null ? undefined : String(body.detected_student_code || '').trim() || null
    const detectedPaperCode = body.detected_paper_code == null ? undefined : String(body.detected_paper_code || '').trim() || null
    const answerText = body.answers_text == null ? undefined : String(body.answers_text || '')

    if (!sheetId) return NextResponse.json({ error: 'sheet_id is required' }, { status: 400 })

    const svc = serviceRoleClient()
    const { data: teacher } = await svc
      .from('teacher_profiles')
      .select('user_id,can_create_exam,school_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!teacher || !teacher.can_create_exam) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: exam } = await svc.from('official_exams').select('id,school_id').eq('id', params.examId).maybeSingle()
    if (!exam || exam.school_id !== teacher.school_id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data: sheet } = await svc
      .from('official_exam_sheets')
      .select('id,official_exam_id,metadata')
      .eq('id', sheetId)
      .eq('official_exam_id', params.examId)
      .maybeSingle()
    if (!sheet) return NextResponse.json({ error: 'Sheet not found' }, { status: 404 })

    const nowIso = new Date().toISOString()
    const nextMeta = { ...(sheet as any).metadata }
    if (answerText !== undefined) {
      const map = parseAnswerText(answerText)
      nextMeta.answer_map = map
      nextMeta.answers_text = answerText
    }

    const match_status = studentId && paperId ? 'matched' : 'unmatched'
    const patch: any = {
      student_id: studentId,
      paper_id: paperId,
      match_status,
      updated_at: nowIso,
      metadata: nextMeta,
    }
    if (detectedStudentCode !== undefined) patch.detected_student_code = detectedStudentCode
    if (detectedPaperCode !== undefined) patch.detected_paper_code = detectedPaperCode

    const { data: updated, error } = await svc
      .from('official_exam_sheets')
      .update(patch)
      .eq('id', sheetId)
      .eq('official_exam_id', params.examId)
      .select('*')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    await svc
      .from('official_exam_processing_logs')
      .insert({
        official_exam_id: params.examId,
        sheet_id: sheetId,
        status: 'sheet_updated',
        message: `match_status=${match_status}`,
        created_at: nowIso,
      } as any)

    return NextResponse.json({ sheet: updated })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}

