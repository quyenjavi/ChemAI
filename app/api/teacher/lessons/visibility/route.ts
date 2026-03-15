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
    const isTeacherRecommended = body?.is_teacher_recommended
    const rawDisplayOrder = body?.display_order
    const displayOrder = (rawDisplayOrder == null || rawDisplayOrder === '')
      ? null
      : Number.isFinite(Number(rawDisplayOrder)) ? parseInt(String(rawDisplayOrder), 10) : NaN
    if (displayOrder !== null && (!Number.isFinite(displayOrder) || displayOrder <= 0)) {
      return NextResponse.json({ error: 'display_order must be a positive integer or null' }, { status: 400 })
    }
    if (!lessonId || (typeof isVisible !== 'boolean' && !lessonType && typeof isTeacherRecommended !== 'boolean' && rawDisplayOrder === undefined)) {
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
        ...(lessonType ? { lesson_type: lessonType } : {}),
        ...(typeof isTeacherRecommended === 'boolean' ? { is_teacher_recommended: isTeacherRecommended } : {}),
        ...(rawDisplayOrder !== undefined ? { display_order: displayOrder } : {})
      })
      .eq('id', lessonId)
    if (error) return NextResponse.json({ error: error.message || 'Update failed' }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
