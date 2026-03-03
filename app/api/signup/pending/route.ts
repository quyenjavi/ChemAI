import { NextResponse } from 'next/server'
import { serviceRoleClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const email = (body.email || '').toString()
    if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })
    const payload = {
      email,
      full_name: body.full_name || '',
      school: body.school || '',
      class_name: body.class_name || '',
      academic_year: body.academic_year || '',
      birth_date: body.birth_date || null
    }
    const svc = serviceRoleClient()
    const { error } = await svc.from('pending_signups').insert(payload)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
