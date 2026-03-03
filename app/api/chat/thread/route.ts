import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const { attemptId } = await request.json()
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const svc = serviceRoleClient()
    // verify attempt ownership
    const { data: attempt } = await svc.from('quiz_attempts').select('id,user_id').eq('id', attemptId).single()
    if (!attempt || attempt.user_id !== user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    // find or create thread
    const { data: existing } = await svc.from('chat_threads').select('id').eq('attempt_id', attemptId).eq('user_id', user.id).maybeSingle()
    if (existing) {
      return NextResponse.json({ threadId: existing.id })
    }
    const { data: created, error } = await svc.from('chat_threads').insert({ attempt_id: attemptId, user_id: user.id }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ threadId: created.id })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
