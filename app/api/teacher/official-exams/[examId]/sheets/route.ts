import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

function normalizeText(v: any) {
  return String(v ?? '').trim()
}

export async function GET(req: Request, { params }: { params: { examId: string } }) {
  const examId = params.examId
  const url = new URL(req.url)
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || 50)))

  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = serviceRoleClient()
  const { data: teacher } = await svc.from('teacher_profiles').select('id').eq('user_id', user.id).maybeSingle()
  if (!teacher?.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: exam } = await svc.from('official_exams').select('id, teacher_id').eq('id', examId).maybeSingle()
  if (!exam || String(exam.teacher_id) !== String(teacher.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: sheets, error } = await svc
    .from('official_exam_sheets')
    .select('id, batch_id, sheet_no, detected_student_code, detected_paper_code, student_id, paper_id, match_status, process_status, storage_bucket, storage_path, created_at')
    .eq('official_exam_id', examId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const out: any[] = []
  for (const s of (sheets || []) as any[]) {
    const bucket = normalizeText(s.storage_bucket)
    const path = normalizeText(s.storage_path)
    let signed_url: string | null = null
    if (bucket && path) {
      const { data } = await svc.storage.from(bucket).createSignedUrl(path, 60 * 10)
      signed_url = data?.signedUrl || null
    }
    out.push({
      id: String(s.id),
      batch_id: s.batch_id ? String(s.batch_id) : null,
      sheet_no: s.sheet_no ?? null,
      detected_student_code: s.detected_student_code || null,
      detected_paper_code: s.detected_paper_code || null,
      student_id: s.student_id ? String(s.student_id) : null,
      paper_id: s.paper_id ? String(s.paper_id) : null,
      match_status: normalizeText(s.match_status) || null,
      process_status: normalizeText(s.process_status) || null,
      signed_url,
      created_at: s.created_at
    })
  }

  return NextResponse.json({ items: out })
}

