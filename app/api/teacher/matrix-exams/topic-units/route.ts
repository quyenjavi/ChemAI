import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const lessonId = String(url.searchParams.get('lesson_id') || '').trim()
    if (!lessonId) return NextResponse.json({ error: 'lesson_id is required' }, { status: 400 })

    const svc = serviceRoleClient()
    const { data: teacher } = await svc
      .from('teacher_profiles')
      .select('user_id,can_create_exam')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!teacher || !teacher.can_create_exam) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: rows, error } = await svc
      .from('questions')
      .select('topic_unit')
      .eq('lesson_id', lessonId)
      .limit(5000)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const units = Array.from(
      new Set((rows || []).map((r: any) => String(r.topic_unit || '').trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b))

    return NextResponse.json({ topic_units: units })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}

