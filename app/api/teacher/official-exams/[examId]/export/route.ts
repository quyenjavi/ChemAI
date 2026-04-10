import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

function escCsv(v: any) {
  const s = String(v ?? '')
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) return `"${s.replace(/"/g, '""')}"`
  return s
}

function normalizeText(v: any) {
  return String(v ?? '').trim()
}

export async function GET(req: Request, { params }: { params: { examId: string } }) {
  const examId = params.examId
  const url = new URL(req.url)
  const group = normalizeText(url.searchParams.get('group') || 'class')
  const by = (group === 'room') ? 'room' : 'class'

  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = serviceRoleClient()
  const { data: teacher } = await svc.from('teacher_profiles').select('id, school_id').eq('user_id', user.id).maybeSingle()
  if (!teacher?.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const schoolId = teacher.school_id ? String(teacher.school_id) : null
  if (!schoolId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: exam } = await svc.from('official_exams').select('id, title, school_id').eq('id', examId).maybeSingle()
  if (!exam || String(exam.school_id) !== schoolId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: students, error: stuErr } = await svc
    .from('official_exam_students')
    .select('student_code, full_name, class_name, birth_date, gender, room_no')
    .eq('official_exam_id', examId)
    .limit(200000)
  if (stuErr) return NextResponse.json({ error: stuErr.message }, { status: 500 })

  const rows = (students || []).map((s: any) => ({
    student_code: normalizeText(s.student_code),
    full_name: normalizeText(s.full_name),
    class_name: normalizeText(s.class_name),
    birth_date: s.birth_date ? String(s.birth_date) : '',
    gender: normalizeText(s.gender),
    room_no: normalizeText(s.room_no)
  }))

  rows.sort((a: any, b: any) => {
    const ga = by === 'room'
      ? (a.room_no || '')
      : (a.class_name || '')
    const gb = by === 'room'
      ? (b.room_no || '')
      : (b.class_name || '')
    const c = ga.localeCompare(gb, 'vi')
    if (c !== 0) return c
    return (a.student_code || '').localeCompare((b.student_code || ''), 'vi')
  })

  const header = [
    'student_code',
    'full_name',
    'class_name',
    'birth_date',
    'gender',
    'room_no'
  ]

  const lines: string[] = []
  lines.push(header.join(','))
  for (const r of rows as any[]) {
    lines.push([
      r.student_code,
      r.full_name,
      r.class_name,
      r.birth_date,
      r.gender,
      r.room_no
    ].map(escCsv).join(','))
  }

  const csv = '\uFEFF' + lines.join('\n')
  const safe = normalizeText(exam.title || 'official-exam').replace(/[^\p{L}\p{N}\s_-]+/gu, '').trim().replace(/\s+/g, '_')
  const filename = `${safe || 'official-exam'}_${by}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${escCsv(filename)}"`
    }
  })
}
