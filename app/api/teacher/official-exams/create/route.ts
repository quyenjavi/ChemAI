import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

async function pickFallbackClassId(svc: ReturnType<typeof serviceRoleClient>, teacherUserId: string, gradeId: string) {
  const { data: teacherRow } = await svc
    .from('teacher_profiles')
    .select('id')
    .eq('user_id', teacherUserId)
    .maybeSingle()
  const teacherId = (teacherRow as any)?.id
  if (!teacherId) return null

  const { data: ass1 } = await svc
    .from('teacher_class_assignments')
    .select('class_id')
    .eq('teacher_id', teacherId)
  const { data: ass2 } = await svc
    .from('teacher_class_assignments')
    .select('class_id')
    .eq('teacher_user_id', teacherUserId)
  const classIds = Array.from(new Set([...(ass1 || []).map((a: any) => a.class_id), ...(ass2 || []).map((a: any) => a.class_id)]).values()).filter(Boolean)
  if (classIds.length === 0) return null

  const { data: classes } = await svc
    .from('classes')
    .select('id,grade_id')
    .in('id', classIds)

  const match = (classes || []).find((c: any) => String(c.grade_id || '') === gradeId)
  return (match as any)?.id || classIds[0] || null
}

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const title = String(body.title || '').trim()
    const subject = String(body.subject || '').trim()
    const grade_id = String(body.grade_id || '').trim()
    const academic_year_id = String(body.academic_year_id || '').trim()
    const semester = String(body.semester || '').trim()
    const duration_minutes = Number(body.duration_minutes || 0)
    const description = String(body.description || '').trim()
    const exam_date = body.exam_date ? new Date(body.exam_date).toISOString() : null

    if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })
    if (!subject) return NextResponse.json({ error: 'subject is required' }, { status: 400 })
    if (!grade_id) return NextResponse.json({ error: 'grade_id is required' }, { status: 400 })
    if (!academic_year_id) return NextResponse.json({ error: 'academic_year_id is required' }, { status: 400 })
    if (!semester) return NextResponse.json({ error: 'semester is required' }, { status: 400 })
    if (!duration_minutes || duration_minutes <= 0) return NextResponse.json({ error: 'duration_minutes is required' }, { status: 400 })

    const svc = serviceRoleClient()
    const { data: teacher } = await svc
      .from('teacher_profiles')
      .select('user_id,can_create_exam,school_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!teacher || !teacher.can_create_exam) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const school_id = String((teacher as any).school_id || '').trim()
    if (!school_id) return NextResponse.json({ error: 'Teacher profile missing school_id' }, { status: 400 })

    const { data: schoolRow, error: schoolErr } = await svc
      .from('schools')
      .select('id,city_id')
      .eq('id', school_id)
      .maybeSingle()
    if (schoolErr) return NextResponse.json({ error: schoolErr.message }, { status: 500 })
    if (!schoolRow) return NextResponse.json({ error: 'School not found' }, { status: 404 })
    const city_id = String((schoolRow as any)?.city_id || '').trim()
    if (!city_id) return NextResponse.json({ error: 'School missing city_id' }, { status: 400 })

    const nowIso = new Date().toISOString()
    const basePayload: any = {
      title,
      subject,
      city_id,
      school_id,
      class_id: null,
      grade_id,
      academic_year_id,
      exam_date,
      semester,
      duration_minutes,
      description: description || null,
      status: 'draft',
      teacher_user_id: user.id,
      created_by: user.id,
      total_papers: 0,
      total_students: 0,
      total_sheets: 0,
      total_graded: 0,
      created_at: nowIso,
      updated_at: nowIso,
    }

    const first = await svc.from('official_exams').insert(basePayload).select('id').single()
    if (first.error) {
      const msg = String(first.error.message || '')
      if (msg.toLowerCase().includes('class_id') && msg.toLowerCase().includes('not-null')) {
        const fallbackClassId = await pickFallbackClassId(svc, user.id, grade_id)
        if (!fallbackClassId) return NextResponse.json({ error: 'Missing class assignment for teacher (required by schema)' }, { status: 400 })
        const second = await svc.from('official_exams').insert({ ...basePayload, class_id: fallbackClassId }).select('id').single()
        if (second.error) return NextResponse.json({ error: second.error.message }, { status: 400 })
        return NextResponse.json({ exam_id: second.data.id })
      }
      return NextResponse.json({ error: first.error.message }, { status: 400 })
    }

    return NextResponse.json({ exam_id: first.data.id })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
