import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const status = String(url.searchParams.get('status') || '').trim()
    const gradeId = String(url.searchParams.get('grade_id') || '').trim()
    const academicYearId = String(url.searchParams.get('academic_year_id') || '').trim()
    const q = String(url.searchParams.get('q') || '').trim()

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

    let query = svc
      .from('official_exams')
      .select(`
        id,
        title,
        subject,
        status,
        exam_date,
        total_papers,
        total_students,
        total_sheets,
        total_graded,
        created_at,
        school:schools(id,name),
        grade:grades(id,name),
        academic_year:academic_years(id,name)
      `)
      .eq('school_id', teacher.school_id)
      .order('created_at', { ascending: false })
      .limit(200)

    if (status) query = query.eq('status', status)
    if (gradeId) query = query.eq('grade_id', gradeId)
    if (academicYearId) query = query.eq('academic_year_id', academicYearId)
    if (q) query = query.ilike('title', `%${q}%`)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ items: data || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}

