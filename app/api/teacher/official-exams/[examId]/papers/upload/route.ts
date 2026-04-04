import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export const maxDuration = 300

function inferPaperCode(filename: string, order: number) {
  const base = String(filename || '')
  const m1 = base.match(/\b([A-D])\b/i)
  if (m1?.[1]) return m1[1].toUpperCase()
  const letters = ['A', 'B', 'C', 'D']
  return letters[Math.max(0, Math.min(3, order - 1))] || String(order)
}

function extForPaper(mime: string) {
  const m = String(mime || '').toLowerCase()
  if (m.includes('pdf')) return 'pdf'
  if (m.includes('officedocument.wordprocessingml.document')) return 'docx'
  if (m.includes('msword')) return 'doc'
  return 'bin'
}

export async function POST(req: Request, { params }: { params: { examId: string } }) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const svc = serviceRoleClient()
    const { data: teacher } = await svc
      .from('teacher_profiles')
      .select('user_id,can_create_exam,school_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!teacher || !teacher.can_create_exam) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: exam } = await svc.from('official_exams').select('id,school_id').eq('id', params.examId).maybeSingle()
    if (!exam || exam.school_id !== teacher.school_id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const form = await req.formData()
    const files = form.getAll('files').filter(Boolean) as File[]
    if (!files.length) return NextResponse.json({ error: 'No files' }, { status: 400 })

    const { data: existing } = await svc
      .from('official_exam_papers')
      .select('id,upload_order,is_master_source')
      .eq('official_exam_id', params.examId)
      .order('upload_order', { ascending: false })
      .limit(1)
    const startOrder = (existing?.[0]?.upload_order ? Number(existing[0].upload_order) : 0) + 1
    const hasMaster = (existing || []).some((p: any) => !!p.is_master_source)

    const bucket = 'chemai-official-exams'
    const createdRows: any[] = []
    let order = startOrder

    for (const f of files) {
      const originalName = String((f as any).name || '')
      const mime = String((f as any).type || 'application/octet-stream')
      const arrayBuffer = await f.arrayBuffer()
      const bytes = new Uint8Array(arrayBuffer)
      const paperCode = inferPaperCode(originalName, order)
      const ext = extForPaper(mime)
      const safeName = `${paperCode}-${Date.now()}.${ext}`
      const storagePath = `official_exams/${params.examId}/papers/${safeName}`

      const up = await svc.storage.from(bucket).upload(storagePath, bytes, { contentType: mime, upsert: true })
      if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 })

      const nowIso = new Date().toISOString()
      const isMaster = !hasMaster && order === 1
      const { data: inserted, error: insErr } = await svc
        .from('official_exam_papers')
        .insert({
          official_exam_id: params.examId,
          paper_code: paperCode,
          upload_order: order,
          is_master_source: isMaster,
          process_status: 'uploaded',
          verification_note: null,
          total_questions: 0,
          created_at: nowIso,
          updated_at: nowIso,
          metadata: {
            storage_bucket: bucket,
            storage_path: storagePath,
            mime_type: mime,
            original_name: originalName,
            safe_name: safeName,
            size: bytes.length,
          },
        } as any)
        .select('*')
        .single()

      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 })
      createdRows.push(inserted)
      order += 1
    }

    const { count: paperCount } = await svc
      .from('official_exam_papers')
      .select('id', { count: 'exact', head: true })
      .eq('official_exam_id', params.examId)
    await svc
      .from('official_exams')
      .update({ total_papers: paperCount || 0, updated_at: new Date().toISOString() } as any)
      .eq('id', params.examId)

    await svc
      .from('official_exam_processing_logs')
      .insert({
        official_exam_id: params.examId,
        status: 'papers_uploaded',
        message: `Uploaded ${createdRows.length} paper file(s) to private storage.`,
      } as any)

    return NextResponse.json({ papers: createdRows })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
