import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const svc = serviceRoleClient()

    const { data: teacherRow } = await svc
      .from('teacher_profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
    const can_update = !!teacherRow

    const { data: top_students } = await svc
      .from('leaderboard_students')
      .select('rank,student_name,class_name,school_name,avg_percent,total_questions_done,updated_at')
      .order('rank', { ascending: true })
      .order('student_name', { ascending: true })
      .limit(10)

    const { data: top_schools } = await svc
      .from('leaderboard_schools')
      .select('rank,student_name,class_name,school_name,avg_score,total_attempts,updated_at')
      .order('rank', { ascending: true })
      .order('student_name', { ascending: true })
      .limit(10)

    const { data: lastStudentUpdatedRows } = await svc
      .from('leaderboard_students')
      .select('updated_at')
      .order('updated_at', { ascending: false })
      .limit(1)

    const { data: lastSchoolUpdatedRows } = await svc
      .from('leaderboard_schools')
      .select('updated_at')
      .order('updated_at', { ascending: false })
      .limit(1)

    const last_updated_students = (lastStudentUpdatedRows?.[0] as any)?.updated_at ?? null
    const last_updated_schools = (lastSchoolUpdatedRows?.[0] as any)?.updated_at ?? null

    return NextResponse.json({
      can_update,
      last_updated_students,
      last_updated_schools,
      top_students: top_students || [],
      top_schools: top_schools || []
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
