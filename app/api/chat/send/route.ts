import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'
import { env } from '@/lib/env'

async function callDifyChat(body: any) {
  const res = await fetch(`${env.difyBaseUrl}/chat-messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.difyChatKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Dify chat error: ${res.status} ${text}`)
  }
  return res.json()
}

export async function POST(request: Request) {
  try {
    const { threadId, content } = await request.json()
    if (!threadId || !content) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const svc = serviceRoleClient()
    const { data: thread } = await svc.from('chat_threads').select('id,user_id,attempt_id').eq('id', threadId).single()
    if (!thread || thread.user_id !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    // save user message
    await svc.from('chat_messages').insert({ thread_id: threadId, role: 'user', content })
    // call dify
    const difyRes = await callDifyChat({
      inputs: {},
      query: content,
      response_mode: 'blocking',
      user: user.id,
      conversation_id: ''
    })
    const reply = difyRes?.answer || difyRes?.data?.answer || ''
    await svc.from('chat_messages').insert({ thread_id: threadId, role: 'assistant', content: reply })
    return NextResponse.json({ reply })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
