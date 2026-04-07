import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

function safeName(original: string, fallbackExt: string) {
  const ext = (original.split('.').pop() || fallbackExt).toLowerCase().replace(/[^a-z0-9]/g, '')
  const base = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${base}.${ext || fallbackExt}`
}

export async function POST(req: Request, { params }: { params: { examId: string } }) {
  const examId = params.examId
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = serviceRoleClient()
  const { data: teacher } = await svc.from('teacher_profiles').select('id').eq('user_id', user.id).maybeSingle()
  if (!teacher?.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: exam } = await svc.from('official_exams').select('id, teacher_id').eq('id', examId).maybeSingle()
  if (!exam || String(exam.teacher_id) !== String(teacher.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const form = await req.formData()
  const files = form.getAll('files') as File[]
  const batch_name = String(form.get('batch_name') || '').trim() || null
  if (!files?.length) return NextResponse.json({ error: 'Thiếu file bài làm' }, { status: 400 })

  const { data: batch, error: batchErr } = await svc
    .from('official_exam_sheet_batches')
    .insert({
      official_exam_id: examId,
      batch_name,
      upload_type: 'image',
      status: 'uploaded',
      total_pages: files.length,
      total_sheets: files.length,
      processed_sheets: 0,
      uploaded_by: user.id,
      metadata: {}
    })
    .select('id')
    .single()
  if (batchErr) return NextResponse.json({ error: batchErr.message }, { status: 500 })

  const bucket = 'chemai-official-exams'
  let idx = 0
  const sheetRows: any[] = []

  for (const f of files) {
    idx += 1
    const arr = await f.arrayBuffer()
    const buf = Buffer.from(arr)
    const contentType = f.type || 'image/jpeg'
    const name = safeName(f.name || `sheet-${idx}.jpg`, 'jpg')
    const path = `official_exams/${examId}/sheets/${batch.id}/${name}`
    const { error: upErr } = await svc.storage.from(bucket).upload(path, buf, { contentType, upsert: false })
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

    sheetRows.push({
      official_exam_id: examId,
      batch_id: batch.id,
      sheet_no: idx,
      page_from: idx,
      page_to: idx,
      image_url: null,
      storage_bucket: bucket,
      storage_path: path,
      process_status: 'uploaded',
      match_status: 'unmatched',
      ocr_json: {},
      metadata: { original_name: f.name || null, content_type: contentType, size: buf.length }
    })
  }

  const { error: insErr } = await svc.from('official_exam_sheets').insert(sheetRows)
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, batch_id: batch.id, inserted: sheetRows.length })
}

