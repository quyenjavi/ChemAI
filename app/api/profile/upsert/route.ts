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
      school_id: body.school_id ?? null,
      grade_id: body.grade_id ?? null,
      class_id: body.class_id ?? null,
      academic_year_id: body.academic_year_id ?? null,
      school: body.school ?? '',
      academic_year: body.academic_year ?? '',
      birth_date: body.birth_date ? new Date(body.birth_date) : null
    }
    const svc = serviceRoleClient()
    if (!payload.academic_year_id) {
      const now = new Date()
      const y = now.getFullYear()
      const m = now.getMonth() + 1
      const d = now.getDate()
      const label = (m > 7 || (m === 7 && d >= 1)) ? `${y}-${y+1}` : `${y-1}-${y}`
      const { data: ay } = await svc.from('academic_years').select('id,name').eq('name', label).maybeSingle()
      payload.academic_year_id = ay?.id ?? null
      payload.academic_year = ay?.name ?? payload.academic_year
    }
    const { error } = await svc.from('student_profiles').upsert(payload, { onConflict: 'user_id' })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
