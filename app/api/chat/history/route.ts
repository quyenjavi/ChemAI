import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const threadId = searchParams.get('threadId')
    if (!threadId) return NextResponse.json({ error: 'threadId required' }, { status: 400 })
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const svc = serviceRoleClient()
    // verify thread ownership
    const { data: thread } = await svc.from('chat_threads').select('id,user_id').eq('id', threadId).single()
    if (!thread || thread.user_id !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const { data: rows } = await svc.from('chat_messages').select('role,content').eq('thread_id', threadId).order('created_at', { ascending: true })
    return NextResponse.json({ messages: rows || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
