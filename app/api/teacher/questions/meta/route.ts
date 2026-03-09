import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ grades: [], lessons: [], school_name: '' }, { status: 401 })
    const svc = serviceRoleClient()
    const { data: tp } = await svc.from('teacher_profiles').select('school_id').eq('user_id', user.id).maybeSingle()
    if (!tp?.school_id) return NextResponse.json({ grades: [], lessons: [], school_name: '' })
    const { data: school } = await svc.from('schools').select('name').eq('id', tp.school_id).maybeSingle()
    const { data: lessons } = await svc.from('lessons').select('id,title,grade_id').order('title', { ascending: true })
    const gradeIds = Array.from(new Set((lessons || []).map((l: any) => l.grade_id).filter(Boolean)))
    const { data: grades } = gradeIds.length ? await svc.from('grades').select('id,name').in('id', gradeIds).order('name', { ascending: true }) : { data: [] }
    const gradeNames = Array.from(new Set((grades || []).map((g: any) => g.name).filter(Boolean)))
    const gradeIndex: Record<string, string> = Object.fromEntries((grades || []).map((g: any) => [g.id, g.name || '']))
    const lessonMeta = (lessons || []).map((l: any) => ({ id: l.id, title: l.title || '', grade_id: l.grade_id || '', grade_name: gradeIndex[l.grade_id] || '' }))

    return NextResponse.json({ grades: gradeNames, lessons: lessonMeta, school_name: school?.name || '' })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
