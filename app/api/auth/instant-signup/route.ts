import { NextResponse } from 'next/server'
import { serviceRoleClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const email = String(body.email || '').trim()
    const password = String(body.password || '')
    const full_name = String(body.full_name || '')
    const school_id = body.school_id as string | undefined
    const grade_id = body.grade_id as string | undefined
    const class_id = body.class_id as string | undefined
    let academic_year_id = body.academic_year_id as string | undefined
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    if (!emailOk) return NextResponse.json({ error: 'Email không hợp lệ' }, { status: 400 })
    if (!password) return NextResponse.json({ error: 'Mật khẩu là bắt buộc' }, { status: 400 })
    if (!full_name || !school_id || !grade_id || !class_id) {
      return NextResponse.json({ error: 'Vui lòng nhập đầy đủ Họ tên, Trường, Khối, Lớp' }, { status: 400 })
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
      const { data: classValid } = await svc.from('classes')
        .select('id')
        .eq('id', class_id)
        .eq('school_id', school_id)
        .eq('grade_id', grade_id)
        .eq('academic_year_id', academic_year_id)
        .maybeSingle()
      if (!classValid) {
        return NextResponse.json({ error: 'Lớp không hợp lệ cho trường/khối/năm học đã chọn' }, { status: 400 })
      }
      if (!academic_year_id) {
        const now = new Date()
        const y = now.getFullYear()
        const m = now.getMonth() + 1
        const d = now.getDate()
        const label = (m > 7 || (m === 7 && d >= 1)) ? `${y}-${y+1}` : `${y-1}-${y}`
        const { data: ay } = await svc.from('academic_years').select('id,name').eq('name', label).maybeSingle()
        academic_year_id = ay?.id
      }
      const { data: schoolRow } = await svc.from('schools').select('name').eq('id', school_id).maybeSingle()
      const { data: classRow } = await svc.from('classes').select('name').eq('id', class_id).maybeSingle()
      const { data: ayRow } = academic_year_id ? await svc.from('academic_years').select('name').eq('id', academic_year_id).maybeSingle() : { data: null }
      const payload = {
        user_id: userId,
        full_name: full_name || '',
        school_id,
        grade_id,
        class_id,
        academic_year_id,
        school: schoolRow?.name || '',
        class_name: classRow?.name || '',
        academic_year: ayRow?.name || '',
        birth_date: null
      }
      await svc.from('student_profiles').upsert(payload, { onConflict: 'user_id' })
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
