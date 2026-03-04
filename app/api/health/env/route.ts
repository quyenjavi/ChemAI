import { NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { createSupabaseServer } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({
      supabasePublic: !!(env.supabaseUrl && env.supabaseAnonKey),
      serviceRoleConfigured: !!env.supabaseServiceKey,
      difyBaseUrl: !!env.difyBaseUrl,
      difyWorkflowKey: !!env.difyWorkflowKey,
      difyChatKey: !!env.difyChatKey
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
