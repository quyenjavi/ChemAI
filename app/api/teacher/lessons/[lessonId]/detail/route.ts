import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export async function GET(_: Request, { params }: { params: { lessonId: string } }) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const svc = serviceRoleClient()
    const { data: teacher } = await svc.from('teacher_profiles').select('id').eq('user_id', user.id).maybeSingle()
    if (!teacher) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: lesson, error } = await svc
      .from('lessons')
      .select('id,title,description,grade_id,created_at,updated_at,is_visible,lesson_type,is_teacher_recommended,display_order,question_count')
      .eq('id', params.lessonId)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!lesson) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })

    let grade_name: string | null = null
    if ((lesson as any).grade_id) {
      const { data: g } = await svc.from('grades').select('name').eq('id', (lesson as any).grade_id).maybeSingle()
      grade_name = (g as any)?.name || null
    }

    return NextResponse.json({ lesson: { ...lesson, grade_name } })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}

