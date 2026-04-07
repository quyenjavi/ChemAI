import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

function normalizeText(v: any) {
  return String(v ?? '').trim()
}

export async function POST(request: Request) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const exam_title = normalizeText(body.exam_title)
  const grade_id = normalizeText(body.grade_id)
  const subject_name = normalizeText(body.subject_name || 'Hóa học')
  const academic_year = normalizeText(body.academic_year)
  const exam_date = body.exam_date ? String(body.exam_date) : null
  const description = normalizeText(body.description)

  if (!exam_title) return NextResponse.json({ error: 'Thiếu tên kì kiểm tra' }, { status: 400 })
  if (!grade_id) return NextResponse.json({ error: 'Thiếu khối' }, { status: 400 })

  const svc = serviceRoleClient()
  const { data: teacher } = await svc
    .from('teacher_profiles')
    .select('id, school_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!teacher?.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const insert: any = {
    teacher_id: teacher.id,
    exam_title,
    grade_id,
    subject_name,
    description: description || null,
    status: 'Draft',
    is_visible: true,
    metadata: {
      academic_year: academic_year || null,
      exam_date: exam_date || null,
      school_id: teacher.school_id || null
    }
  }
  if (exam_date) insert.exam_date = exam_date

  const { data: created, error } = await svc
    .from('official_exams')
    .insert(insert)
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: created.id })
}

