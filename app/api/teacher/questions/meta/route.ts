import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({
        grades: [],
        lessons: [],
        school_name: ''
      }, { status: 401 })
    }

    const svc = serviceRoleClient()

    // Get teacher profile with error handling
    const { data: tp, error: tpError } = await svc
      .from('teacher_profiles')
      .select('school_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (tpError) {
      console.error('Teacher profile query error:', tpError)
      throw tpError
    }

    const tpData = (tp || null) as unknown as { school_id: string } | null

    if (!tpData?.school_id) {
      return NextResponse.json({
        grades: [],
        lessons: [],
        school_name: ''
      })
    }

    // Get school with error handling
    const { data: school, error: schoolError } = await svc
      .from('schools')
      .select('name')
      .eq('id', tpData.school_id)
      .maybeSingle()

    if (schoolError) {
      console.error('School query error:', schoolError)
      throw schoolError
    }

    const schoolData = (school || null) as unknown as { name: string } | null

    // Get lessons with error handling
    const { data: lessons, error: lessonsError } = await svc
      .from('lessons')
      .select('id,title,grade_id')
      .order('title', { ascending: true })

    if (lessonsError) {
      console.error('Lessons query error:', lessonsError)
      throw lessonsError
    }

    const lessonsData = (lessons || []) as unknown as Array<{
      id: string
      title: string
      grade_id: string | null
    }>

    // Get grade IDs from lessons
    const gradeIds = Array.from(
      new Set(lessonsData.map((l) => l.grade_id).filter(Boolean))
    ) as string[]

    // Get grades with error handling
    const { data: grades, error: gradesError } = gradeIds.length
      ? await svc
          .from('grades')
          .select('id,name')
          .in('id', gradeIds)
          .order('name', { ascending: true })
      : { data: [], error: null }

    if (gradesError) {
      console.error('Grades query error:', gradesError)
      throw gradesError
    }

    const gradesData = (grades || []) as unknown as Array<{
      id: string
      name: string | null
    }>

    // Prepare response data
    const gradeNames = Array.from(
      new Set(gradesData.map((g) => g.name).filter(Boolean))
    )

    const gradeIndex: Record<string, string> = Object.fromEntries(
      gradesData.map((g) => [g.id, g.name || ''])
    )

    const lessonMeta = lessonsData.map((l) => ({
      id: l.id,
      title: l.title || '',
      grade_id: l.grade_id || '',
      grade_name: l.grade_id ? gradeIndex[l.grade_id] || '' : ''
    }))

    return NextResponse.json({
      grades: gradeNames,
      lessons: lessonMeta,
      school_name: schoolData?.name || ''
    })
  } catch (e: any) {
    console.error('Meta API Error:', e)
    return NextResponse.json(
      { error: e?.message || 'Server error' },
      { status: 500 }
    )
  }
}