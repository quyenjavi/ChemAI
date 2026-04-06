import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export async function POST(req: Request, { params }: { params: { lessonId: string } }) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const title = body.title == null ? undefined : String(body.title || '').trim()
    const description = body.description == null ? undefined : String(body.description || '').trim()

    const svc = serviceRoleClient()
    const { data: teacher } = await svc.from('teacher_profiles').select('id').eq('user_id', user.id).maybeSingle()
    if (!teacher) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const patch: any = { updated_at: new Date().toISOString() }
    if (title !== undefined) {
      if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })
      patch.title = title
    }
    if (description !== undefined) patch.description = description || null

    const { data, error } = await svc
      .from('lessons')
      .update(patch)
      .eq('id', params.lessonId)
      .select('id,title,description,updated_at')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ lesson: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}

