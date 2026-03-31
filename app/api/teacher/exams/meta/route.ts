import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const svc = serviceRoleClient()
    const { data: teacher } = await svc
      .from('teacher_profiles')
      .select('user_id,can_create_exam')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!teacher) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: grades } = await svc.from('grades').select('id,name').order('name', { ascending: true })
    const { data: lessons } = await svc
      .from('lessons')
      .select('id,title,grade_id,is_visible')
      .eq('is_visible', true)
      .order('title', { ascending: true })
      .limit(1000)
    const { data: diffRows } = await svc.from('questions').select('difficulty').limit(1000)
    const rawDiffs = Array.from(
      new Set((diffRows || []).map((r: any) => r.difficulty).filter((v: any) => v !== null && v !== undefined).map((v: any) => String(v).trim()))
    )
    const numeric = rawDiffs.filter(d => ['1', '2', '3', '4'].includes(d))
    const difficultyValues = Array.from(new Set(['1', '2', '3', '4', ...numeric]))

    return NextResponse.json({
      can_create_exam: !!teacher.can_create_exam,
      grades: grades || [],
      lessons: lessons || [],
      difficulties: difficultyValues
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
