import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const supabase = createSupabaseServer()
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const body = await request.json()
    const payload = {
      user_id: user.id,
      full_name: body.full_name ?? '',
      school: body.school ?? '',
      class_name: body.class_name ?? '',
      academic_year: body.academic_year ?? '',
      birth_date: body.birth_date ? new Date(body.birth_date) : null
    }
    const svc = serviceRoleClient()
    const { error } = await svc.from('student_profiles').upsert(payload, { onConflict: 'user_id' })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
