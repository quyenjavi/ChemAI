import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const svc = serviceRoleClient()
    const { data: tp } = await svc.from('teacher_profiles').select('id,user_id').eq('user_id', user.id).maybeSingle()
    if (!tp) return NextResponse.json({ classes: [] })
    let classIds: string[] = []
    const { data: ass1 } = await svc.from('teacher_class_assignments').select('class_id').eq('teacher_id', tp.id)
    const { data: ass2 } = await svc.from('teacher_class_assignments').select('class_id').eq('teacher_user_id', user.id)
    classIds = Array.from(new Set([...(ass1 || []).map((a: any) => a.class_id), ...(ass2 || []).map((a: any) => a.class_id)]).values()).filter(Boolean)
    if (classIds.length === 0) return NextResponse.json({ classes: [] })
    const { data: classes } = await svc.from('classes').select('id,name,grade_id,academic_year_id').in('id', classIds)
    const gradeIds = Array.from(new Set((classes || []).map((c: any) => c.grade_id).filter(Boolean)))
    const { data: grades } = gradeIds.length ? await svc.from('grades').select('id,name').in('id', gradeIds) : { data: [] }
    const gradeNameById: Record<string, string> = Object.fromEntries((grades || []).map((g: any) => [g.id, g.name || '']))
    const { data: students } = await svc.from('student_profiles').select('user_id,class_id').in('class_id', classIds)
    const totalByClass: Record<string, number> = {}
    for (const s of (students || []) as any[]) {
      totalByClass[s.class_id] = (totalByClass[s.class_id] || 0) + 1
    }
    const payload = (classes || []).map((c: any) => ({
      class_id: c.id,
      class_name: c.name,
      grade_name: gradeNameById[c.grade_id] || '',
      academic_year_id: c.academic_year_id || null,
      total_students: totalByClass[c.id] || 0
    })).sort((a: any, b: any) => {
      const ga = String(a.grade_name || '')
      const gb = String(b.grade_name || '')
      if (ga === gb) return String(a.class_name || '').localeCompare(String(b.class_name || ''))
      return ga.localeCompare(gb)
    })
    return NextResponse.json({ classes: payload })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
