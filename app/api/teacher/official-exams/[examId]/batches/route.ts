import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export async function GET(req: Request, { params }: { params: { examId: string } }) {
  const examId = params.examId
  const url = new URL(req.url)
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') || 200)))

  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = serviceRoleClient()
  const { data: teacher } = await svc.from('teacher_profiles').select('id, school_id').eq('user_id', user.id).maybeSingle()
  if (!teacher?.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const schoolId = teacher.school_id ? String(teacher.school_id) : null
  if (!schoolId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: exam } = await svc.from('official_exams').select('id, school_id').eq('id', examId).maybeSingle()
  if (!exam || String(exam.school_id) !== schoolId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: rows, error } = await svc
    .from('official_exam_sheets')
    .select('batch_id')
    .eq('official_exam_id', examId)
    .limit(200000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const batchIds = Array.from(new Set((rows || []).map((r: any) => r.batch_id ? String(r.batch_id) : '').filter(Boolean)))
  const { data: batchRows, error: batchErr } = batchIds.length
    ? await svc.from('official_exam_sheet_batches').select('id, batch_name').in('id', batchIds).limit(5000)
    : { data: [] as any[], error: null as any }
  if (batchErr) return NextResponse.json({ error: batchErr.message }, { status: 500 })
  const batchNameById: Record<string, string> = {}
  for (const r of (batchRows || []) as any[]) {
    if (r?.id) batchNameById[String(r.id)] = String(r.batch_name || '')
  }

  const byBatch: Record<string, { batch_id: string, count: number }> = {}
  for (const r of (rows || []) as any[]) {
    const bid = r.batch_id ? String(r.batch_id) : ''
    if (!bid) continue
    const cur = byBatch[bid] || { batch_id: bid, count: 0 }
    cur.count += 1
    byBatch[bid] = cur
  }

  const items = Object.values(byBatch)
    .sort((a, b) => String(a.batch_id).localeCompare(String(b.batch_id)))
    .slice(0, limit)
    .map((b) => ({
      batch_id: b.batch_id,
      batch_name: batchNameById[b.batch_id] || null,
      sheets_count: b.count
    }))

  return NextResponse.json({ items })
}
