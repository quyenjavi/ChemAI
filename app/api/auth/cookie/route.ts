import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const action = body?.action as string | undefined
    const access_token = body?.access_token as string | undefined
    const refresh_token = body?.refresh_token as string | undefined
    const cookieStore = cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore } as any)

    if (action === 'signout' || (!access_token || !refresh_token)) {
      const { error } = await supabase.auth.signOut()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ ok: true })
    }

    const { error } = await supabase.auth.setSession({ access_token, refresh_token })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
