import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const svc = serviceRoleClient()
    const { data: teacher, error: teacherErr } = await svc
      .from('teacher_profiles')
      .select('user_id,can_create_exam,school_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (teacherErr) return NextResponse.json({ error: teacherErr.message }, { status: 500 })
    if (!teacher || !teacher.can_create_exam) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: gradesRaw } = await svc.from('grades').select('id,name').order('name', { ascending: true })
    const grades = (gradesRaw || []).filter((g: any) => ['10', '11', '12'].includes(String(g.name)))

    const teacherSchoolId = String((teacher as any).school_id || '').trim()

    if (!teacherSchoolId) return NextResponse.json({ error: 'Teacher profile missing school_id' }, { status: 400 })

    const [{ data: school, error: schoolErr }, { data: academic_years }] = await Promise.all([
      svc
        .from('schools')
        .select('id,name,city_id')
        .eq('id', teacherSchoolId)
        .maybeSingle(),
      svc.from('academic_years').select('id,name').order('name', { ascending: false }),
    ])
    if (schoolErr) return NextResponse.json({ error: schoolErr.message }, { status: 500 })
    if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 })

    const cityId = String((school as any)?.city_id || '').trim()
    if (!cityId) return NextResponse.json({ error: 'School missing city_id' }, { status: 400 })

    const { data: city, error: cityErr } = await svc
      .from('cities')
      .select('id,name')
      .eq('id', cityId)
      .maybeSingle()
    if (cityErr) return NextResponse.json({ error: cityErr.message }, { status: 500 })

    return NextResponse.json({
      teacher: {
        city: city || { id: cityId, name: '' },
        school: { id: (school as any).id, name: (school as any).name || '' },
      },
      grades,
      academic_years: academic_years || [],
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
