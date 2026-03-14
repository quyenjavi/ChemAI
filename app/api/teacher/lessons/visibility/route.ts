import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const lessonId = String(body?.lesson_id || '')
    const isVisible = body?.is_visible
    const rawLessonType = body?.lesson_type
    const lessonType = rawLessonType === 'exam' ? 'exam' : rawLessonType === 'practice' ? 'practice' : null
    if (!lessonId || (typeof isVisible !== 'boolean' && !lessonType)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const svc = serviceRoleClient()
    const { data: teacher } = await svc
      .from('teacher_profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!teacher) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { error } = await svc
      .from('lessons')
      .update({
        ...(typeof isVisible === 'boolean' ? { is_visible: isVisible } : {}),
        ...(lessonType ? { lesson_type: lessonType } : {})
      })
      .eq('id', lessonId)
    if (error) return NextResponse.json({ error: error.message || 'Update failed' }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
