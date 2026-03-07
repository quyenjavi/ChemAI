import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export async function POST() {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const svc = serviceRoleClient()
    const { data: profile } = await svc.from('student_profiles').select('user_id').eq('user_id', user.id).maybeSingle()
    if (profile) return NextResponse.json({ ok: true, status: 'exists' })
    const { data: pending } = await svc.from('pending_signups').select('*').eq('email', user.email!).maybeSingle()
    if (!pending) return NextResponse.json({ ok: true, status: 'no_pending' })
    const payload = {
      user_id: user.id,
      full_name: pending.full_name || '',
      school: pending.school || '',
      academic_year: pending.academic_year || '',
      birth_date: pending.birth_date || null
    }
    const { error } = await svc.from('student_profiles').upsert(payload, { onConflict: 'user_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    await svc.from('pending_signups').delete().eq('email', user.email!)
    return NextResponse.json({ ok: true, status: 'migrated' })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
