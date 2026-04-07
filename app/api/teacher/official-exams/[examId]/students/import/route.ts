import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

function normText(v: any) {
  return String(v ?? '').trim()
}

function toDateOnly(v: string) {
  const s = normText(v)
  if (!s) return null
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export async function POST(req: Request, { params }: { params: { examId: string } }) {
  const examId = params.examId
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const items = Array.isArray(body.items) ? body.items : []
  if (!items.length) return NextResponse.json({ error: 'Danh sách rỗng' }, { status: 400 })

  const svc = serviceRoleClient()
  const { data: teacher } = await svc.from('teacher_profiles').select('id').eq('user_id', user.id).maybeSingle()
  if (!teacher?.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: exam } = await svc.from('official_exams').select('id, teacher_id').eq('id', examId).maybeSingle()
  if (!exam || String(exam.teacher_id) !== String(teacher.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const normalized: Array<{ student_code: string, full_name: string, class_name: string, gender: string, birth_date: string | null, note: string }> = items.map((it: any) => ({
    student_code: normText(it.student_code),
    full_name: normText(it.full_name),
    class_name: normText(it.class_name),
    gender: normText(it.gender),
    birth_date: toDateOnly(normText(it.birth_date)),
    note: normText(it.note)
  })).filter((x: { student_code: string, full_name: string, class_name: string }) => x.student_code && x.full_name && x.class_name)

  if (!normalized.length) return NextResponse.json({ error: 'Không có dòng hợp lệ (thiếu student_code / full_name / class_name)' }, { status: 400 })

  const dupInPayload: string[] = []
  const seen: Record<string, number> = {}
  for (const it of normalized) {
    seen[it.student_code] = (seen[it.student_code] || 0) + 1
  }
  for (const [k, v] of Object.entries(seen)) if (v > 1) dupInPayload.push(k)
  if (dupInPayload.length) return NextResponse.json({ error: 'Có trùng student_code trong file', duplicates: dupInPayload }, { status: 400 })

  const codes = normalized.map((x: { student_code: string }) => x.student_code)
  const { data: existing } = await svc
    .from('official_exam_students')
    .select('student_code')
    .eq('official_exam_id', examId)
    .in('student_code', codes)
    .limit(50000)

  const existingSet = new Set((existing || []).map((r: any) => normText(r.student_code)).filter(Boolean))
  if (existingSet.size) {
    return NextResponse.json({ error: 'Có student_code đã tồn tại trong kì kiểm tra', duplicates: Array.from(existingSet) }, { status: 400 })
  }

  const rows = normalized.map((x) => ({
    official_exam_id: examId,
    student_code: x.student_code,
    full_name: x.full_name,
    class_name: x.class_name,
    gender: x.gender || null,
    birth_date: x.birth_date,
    metadata: {
      note: x.note || null
    }
  }))

  const { error } = await svc.from('official_exam_students').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, inserted: rows.length })
}
