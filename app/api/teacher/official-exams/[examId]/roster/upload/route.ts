import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export const maxDuration = 300

function splitLine(line: string) {
  const s = line.replace(/\r/g, '')
  if (s.includes('\t')) return s.split('\t').map(x => x.trim())
  if (s.includes(';')) return s.split(';').map(x => x.trim())
  return s.split(',').map(x => x.trim())
}

function parseRosterCsv(text: string) {
  const lines = String(text || '').split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length === 0) return []
  const header = splitLine(lines[0]).map(h => h.toLowerCase())
  const idx = (names: string[]) => header.findIndex(h => names.includes(h))
  const iCode = idx(['student_code', 'sbd', 'so_bao_danh', 'code'])
  const iName = idx(['full_name', 'ho_ten', 'name'])
  const iClass = idx(['class_name', 'lop', 'class'])
  const iSeat = idx(['seat_no', 'so_ghe', 'seat'])
  const rows: Array<{ student_code: string, full_name: string, class_name: string, seat_no: number | null }> = []
  for (const line of lines.slice(1)) {
    const cols = splitLine(line)
    const student_code = iCode >= 0 ? String(cols[iCode] || '').trim() : ''
    const full_name = iName >= 0 ? String(cols[iName] || '').trim() : ''
    const class_name = iClass >= 0 ? String(cols[iClass] || '').trim() : ''
    const seatRaw = iSeat >= 0 ? String(cols[iSeat] || '').trim() : ''
    const seat_no = seatRaw ? (parseInt(seatRaw, 10) || null) : null
    if (!student_code || !full_name) continue
    rows.push({ student_code, full_name, class_name, seat_no })
  }
  return rows
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
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 })

    const mime = String((file as any).type || 'text/csv')
    const originalName = String((file as any).name || '')
    const bytes = new Uint8Array(await file.arrayBuffer())
    const bucket = 'chemai-official-exams'
    const safeFile = `roster-${Date.now()}.csv`
    const storagePath = `official_exams/${params.examId}/roster/${safeFile}`
    const up = await svc.storage.from(bucket).upload(storagePath, bytes, { contentType: mime, upsert: true })
    if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 })

    const text = new TextDecoder().decode(bytes)
    const rows = parseRosterCsv(text)
    if (rows.length === 0) return NextResponse.json({ error: 'No rows parsed' }, { status: 400 })

    const nowIso = new Date().toISOString()
    const payload = rows.map(r => ({
      official_exam_id: params.examId,
      student_user_id: null,
      student_code: r.student_code,
      full_name: r.full_name,
      class_name: r.class_name || null,
      seat_no: r.seat_no,
      status: 'active',
      created_at: nowIso,
      updated_at: nowIso,
    }))

    const { error } = await svc
      .from('official_exam_students')
      .upsert(payload as any, { onConflict: 'official_exam_id,student_code' } as any)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    const { count } = await svc
      .from('official_exam_students')
      .select('id', { count: 'exact', head: true })
      .eq('official_exam_id', params.examId)

    await svc
      .from('official_exams')
      .update({ total_students: count || 0, updated_at: nowIso } as any)
      .eq('id', params.examId)

    await svc
      .from('official_exam_processing_logs')
      .insert({
        official_exam_id: params.examId,
        status: 'roster_uploaded',
        message: `Upserted ${rows.length} student(s). File: ${bucket}/${storagePath} (original: ${originalName || '—'})`,
        created_at: nowIso,
      } as any)

    return NextResponse.json({ ok: true, upserted: rows.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
