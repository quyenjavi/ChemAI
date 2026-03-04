import { NextResponse } from 'next/server'
import { serviceRoleClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const email = String(body.email || '').trim()
    const password = String(body.password || '')
    const full_name = String(body.full_name || '')
    const school = String(body.school || '')
    const class_name = String(body.class_name || '')
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    if (!emailOk) return NextResponse.json({ error: 'Email không hợp lệ' }, { status: 400 })
    if (!password) return NextResponse.json({ error: 'Mật khẩu là bắt buộc' }, { status: 400 })
    if (!full_name || !school || !class_name) {
      return NextResponse.json({ error: 'Vui lòng nhập đầy đủ Họ tên, Trường, Lớp' }, { status: 400 })
    }
    const svc = serviceRoleClient()
    const { data, error } = await svc.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name }
    })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    const userId = data.user?.id
    if (userId) {
      const payload = {
        user_id: userId,
        full_name: full_name || '',
        school: school || '',
        class_name: class_name || '',
        academic_year: '',
        birth_date: null
      }
      await svc.from('student_profiles').upsert(payload, { onConflict: 'user_id' })
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
