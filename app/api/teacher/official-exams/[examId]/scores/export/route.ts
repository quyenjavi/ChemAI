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

export async function GET(_req: Request, { params }: { params: { examId: string } }) {
  const examId = params.examId
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = serviceRoleClient()
  const { data: teacher } = await svc.from('teacher_profiles').select('id').eq('user_id', user.id).maybeSingle()
  if (!teacher?.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: exam } = await svc.from('official_exams').select('id, teacher_id, exam_title').eq('id', examId).maybeSingle()
  if (!exam || String(exam.teacher_id) !== String(teacher.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: attempts, error } = await svc
    .from('official_exam_attempts')
    .select('id, student_id, paper_id, raw_score, total_score, correct_count, wrong_count, blank_count, grading_status, graded_at')
    .eq('official_exam_id', examId)
    .order('graded_at', { ascending: true })
    .limit(200000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const studentIds = Array.from(new Set((attempts || []).map((a: any) => String(a.student_id || '')).filter(Boolean)))
  const paperIds = Array.from(new Set((attempts || []).map((a: any) => String(a.paper_id || '')).filter(Boolean)))

  const [studentsRes, papersRes] = await Promise.all([
    studentIds.length ? svc.from('official_exam_students').select('id, student_code, full_name, class_name').in('id', studentIds).limit(50000) : Promise.resolve({ data: [] as any[] }),
    paperIds.length ? svc.from('official_exam_papers').select('id, paper_code').in('id', paperIds).limit(5000) : Promise.resolve({ data: [] as any[] })
  ])

  const studentById: Record<string, any> = {}
  for (const s of (studentsRes.data || []) as any[]) studentById[String(s.id)] = s
  const paperById: Record<string, any> = {}
  for (const p of (papersRes.data || []) as any[]) paperById[String(p.id)] = p

  const header = [
    'student_code',
    'full_name',
    'class_name',
    'paper_code',
    'raw_score',
    'total_score',
    'correct_count',
    'wrong_count',
    'blank_count',
    'grading_status',
    'graded_at'
  ]

  const lines: string[] = []
  lines.push(header.join(','))
  for (const a of (attempts || []) as any[]) {
    const st = studentById[String(a.student_id)] || {}
    const pp = paperById[String(a.paper_id)] || {}
    const row = [
      normalizeText(st.student_code),
      normalizeText(st.full_name),
      normalizeText(st.class_name),
      normalizeText(pp.paper_code),
      a.raw_score ?? '',
      a.total_score ?? '',
      a.correct_count ?? '',
      a.wrong_count ?? '',
      a.blank_count ?? '',
      normalizeText(a.grading_status),
      a.graded_at ?? ''
    ].map(escCsv)
    lines.push(row.join(','))
  }

  const csv = '\uFEFF' + lines.join('\n')
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${escCsv(String(exam.exam_title || 'official-exam'))}.csv"`
    }
  })
}

