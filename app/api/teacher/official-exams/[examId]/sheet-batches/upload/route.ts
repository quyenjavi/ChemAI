import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export const maxDuration = 300

function safeName(s: string) {
  return String(s || '').trim() || 'batch'
}

function extForUpload(mime: string) {
  const m = String(mime || '').toLowerCase()
  if (m.includes('pdf')) return 'pdf'
  if (m.includes('png')) return 'png'
  if (m.includes('webp')) return 'webp'
  if (m.includes('jpg') || m.includes('jpeg')) return 'jpg'
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
    const batchName = safeName(String(form.get('batch_name') || ''))
    const files = form.getAll('files').filter(Boolean) as File[]
    if (!files.length) return NextResponse.json({ error: 'No files' }, { status: 400 })

    const nowIso = new Date().toISOString()
    const { data: createdBatch, error: batchErr } = await svc
      .from('official_exam_sheet_batches')
      .insert({
        official_exam_id: params.examId,
        batch_name: batchName,
        total_pages: 0,
        total_sheets: 0,
        processed_sheets: 0,
        uploaded_by: user.id,
        metadata: { process_status: 'uploaded' },
        created_at: nowIso,
        updated_at: nowIso,
      } as any)
      .select('*')
      .single()

    if (batchErr) return NextResponse.json({ error: batchErr.message }, { status: 400 })

    const bucket = 'chemai-official-exams'
    const uploaded: any[] = []
    const isPdfOnly = files.length === 1 && String((files[0] as any).type || '').includes('pdf')

    if (isPdfOnly) {
      const f = files[0]
      const originalName = String((f as any).name || 'upload.pdf')
      const mime = String((f as any).type || 'application/pdf')
      const bytes = new Uint8Array(await f.arrayBuffer())
      const safeFile = `batch-${Date.now()}.${extForUpload(mime)}`
      const storagePath = `official_exams/${params.examId}/sheet_batches/${createdBatch.id}/${safeFile}`
      const up = await svc.storage.from(bucket).upload(storagePath, bytes, { contentType: mime, upsert: true })
      if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 })

      const metadata = {
        ...(createdBatch as any).metadata,
        storage_bucket: bucket,
        storage_path: storagePath,
        original_name: originalName,
        mime_type: mime,
        size: bytes.length,
        process_status: 'uploaded_pdf',
        safe_name: safeFile,
      }

      await svc
        .from('official_exam_sheet_batches')
        .update({ metadata, updated_at: new Date().toISOString() } as any)
        .eq('id', createdBatch.id)

      await svc
        .from('official_exam_processing_logs')
        .insert({
          official_exam_id: params.examId,
          status: 'batch_uploaded',
          message: `Uploaded batch PDF: ${createdBatch.id}`,
          created_at: nowIso,
        } as any)

      return NextResponse.json({ batch: { ...createdBatch, metadata }, uploaded: 1, created_sheets: 0 })
    }

    let sheetIndex = 1
    const sheetRows: any[] = []
    for (const f of files) {
      const originalName = String((f as any).name || '')
      const mime = String((f as any).type || 'application/octet-stream')
      const bytes = new Uint8Array(await f.arrayBuffer())
      const safeFile = `sheet-${sheetIndex}-${Date.now()}.${extForUpload(mime)}`
      const storagePath = `official_exams/${params.examId}/sheet_batches/${createdBatch.id}/images/${safeFile}`
      const up = await svc.storage.from(bucket).upload(storagePath, bytes, { contentType: mime, upsert: true })
      if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 })
      uploaded.push({ storage_bucket: bucket, storage_path: storagePath, original_name: originalName, mime_type: mime, size: bytes.length, safe_name: safeFile })

      sheetRows.push({
        official_exam_id: params.examId,
        batch_id: createdBatch.id,
        student_id: null,
        paper_id: null,
        storage_bucket: bucket,
        storage_path: storagePath,
        detected_student_code: null,
        detected_paper_code: null,
        match_status: 'unmatched',
        process_status: 'uploaded',
        metadata: { original_name: originalName, mime_type: mime, size: bytes.length, sheet_index: sheetIndex, safe_name: safeFile },
        created_at: nowIso,
        updated_at: nowIso,
      })
      sheetIndex += 1
    }

    const { error: sheetErr } = await svc.from('official_exam_sheets').insert(sheetRows as any)
    if (sheetErr) return NextResponse.json({ error: sheetErr.message }, { status: 400 })

    const batchMeta = {
      ...(createdBatch as any).metadata,
      process_status: 'uploaded_images',
      uploaded_files: uploaded,
    }
    await svc
      .from('official_exam_sheet_batches')
      .update({
        total_pages: uploaded.length,
        total_sheets: uploaded.length,
        processed_sheets: 0,
        metadata: batchMeta,
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', createdBatch.id)

    const { count: totalSheets } = await svc
      .from('official_exam_sheets')
      .select('id', { count: 'exact', head: true })
      .eq('official_exam_id', params.examId)

    await svc
      .from('official_exams')
      .update({ total_sheets: totalSheets || 0, updated_at: new Date().toISOString() } as any)
      .eq('id', params.examId)

    await svc
      .from('official_exam_processing_logs')
      .insert({
        official_exam_id: params.examId,
        status: 'batch_uploaded',
        message: `Uploaded batch images: ${createdBatch.id} (${uploaded.length} sheets)`,
        created_at: nowIso,
      } as any)

    return NextResponse.json({ batch: { ...createdBatch, metadata: batchMeta, total_pages: uploaded.length, total_sheets: uploaded.length }, uploaded: uploaded.length, created_sheets: uploaded.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
