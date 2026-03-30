import { NextResponse } from 'next/server'
import { serviceRoleClient } from '@/lib/supabase/server'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const request_type = String(body.request_type || '')
    const subject = String(body.subject || '')
    const message = String(body.message || '')
    const full_name = String(body.full_name || '')
    const email = String(body.email || '')
    const phone = String(body.phone || '')

    if (!request_type) return NextResponse.json({ error: 'request_type is required' }, { status: 400 })
    if (!message) return NextResponse.json({ error: 'message is required' }, { status: 400 })

    const cookieStore = cookies()
    const supa = createServerComponentClient({ cookies: () => cookieStore } as any)
    const { data: { session } } = await supa.auth.getSession()
    const userId = session?.user?.id || null
    const sessionFullName = String((session?.user as any)?.user_metadata?.full_name || '')
    const sessionEmail = String(session?.user?.email || '')

    if (!userId && (!full_name || !email)) {
      return NextResponse.json({ error: 'full_name and email are required for guests' }, { status: 400 })
    }

    const finalFullName = userId ? (sessionFullName || full_name) : full_name
    const finalEmail = userId ? (sessionEmail || email) : email

    const svc = serviceRoleClient()
    const { error } = await svc
      .from('contact_requests')
      .insert({
        user_id: userId,
        full_name: finalFullName || null,
        email: finalEmail || null,
        phone: phone || null,
        request_type,
        subject: subject || null,
        message,
        status: 'pending'
      })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
