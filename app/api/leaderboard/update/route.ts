import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export async function POST() {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const svc = serviceRoleClient()
    const { data: teacherRow } = await svc
      .from('teacher_profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!teacherRow) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { error } = await svc.rpc('update_leaderboards')
    if (error) return NextResponse.json({ error: error.message || 'Update failed' }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}

