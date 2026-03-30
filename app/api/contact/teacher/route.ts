import { NextResponse } from 'next/server'
import { serviceRoleClient } from '@/lib/supabase/server'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const school_name = String(body.school_name || '')
    const subject_name = String(body.subject_name || '')
    const message = String(body.message || '')
    const full_name = String(body.full_name || '')
    const email = String(body.email || '')
    const phone = String(body.phone || '')

    if (!phone) return NextResponse.json({ error: 'Số điện thoại là bắt buộc' }, { status: 400 })

    const cookieStore = cookies()
    const supa = createServerComponentClient({ cookies: () => cookieStore } as any)
    const { data: { session } } = await supa.auth.getSession()
    const userId = session?.user?.id || null
    const sessionFullName = String((session?.user as any)?.user_metadata?.full_name || '')
    const sessionEmail = String(session?.user?.email || '')

    if (!userId && (!full_name || !email)) {
      return NextResponse.json({ error: 'full_name và email là bắt buộc với khách' }, { status: 400 })
    }

    const finalFullName = userId ? (sessionFullName || full_name) : full_name
    const finalEmail = userId ? (sessionEmail || email) : email

    const svc = serviceRoleClient()
    const { error } = await svc
      .from('teacher_registration_requests')
      .insert({
        user_id: userId,
        full_name: finalFullName || null,
        email: finalEmail || null,
        phone,
        school_name: school_name || null,
        subject_name: subject_name || null,
        message: message || null,
        status: 'pending'
      })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
