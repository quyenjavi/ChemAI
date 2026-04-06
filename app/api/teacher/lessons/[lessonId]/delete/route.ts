import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export async function POST(_: Request, { params }: { params: { lessonId: string } }) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const svc = serviceRoleClient()
    const { data: teacher } = await svc.from('teacher_profiles').select('id').eq('user_id', user.id).maybeSingle()
    if (!teacher) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: lesson } = await svc.from('lessons').select('id,title').eq('id', params.lessonId).maybeSingle()
    if (!lesson) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })

    const title = String((lesson as any).title || '')
    const nextTitle = title.startsWith('[Đã xóa]') ? title : `[Đã xóa] ${title}`

    const { error } = await svc
      .from('lessons')
      .update({
        is_visible: false,
        title: nextTitle,
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', params.lessonId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}

