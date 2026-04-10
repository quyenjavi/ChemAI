import { NextResponse } from 'next/server'
import { serviceRoleClient } from '@/lib/supabase/server'

function normalizeSchoolName(input: string) {
  const s = String(input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[đ]/g, 'd')
    .trim()
    .replace(/\s+/g, ' ')
  return s
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const email = String(body.email || '').trim()
    const password = String(body.password || '')
    const full_name = String(body.full_name || '')
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    if (!emailOk) return NextResponse.json({ error: 'Email không hợp lệ' }, { status: 400 })
    if (!password || password.length < 8) return NextResponse.json({ error: 'Mật khẩu phải có ít nhất 8 ký tự' }, { status: 400 })
    if (!full_name) return NextResponse.json({ error: 'Vui lòng nhập Họ tên' }, { status: 400 })
    const svc = serviceRoleClient()

    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth() + 1
    const d = now.getDate()
    const academicYearLabel = (m > 7 || (m === 7 && d >= 1)) ? `${y}-${y + 1}` : `${y - 1}-${y}`
    let academic_year_id: string | null = null
    const { data: ay } = await svc.from('academic_years').select('id,name').eq('name', academicYearLabel).maybeSingle()
    if (ay?.id) academic_year_id = String(ay.id)
    if (!academic_year_id) {
      const { data: insertedAy, error: ayErr } = await svc
        .from('academic_years')
        .insert({ name: academicYearLabel } as any)
        .select('id')
        .single()
      if (ayErr) return NextResponse.json({ error: 'Không xác định được năm học' }, { status: 400 })
      academic_year_id = String(insertedAy.id)
    }

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
      const defaultCityName = 'Đà Nẵng'
      const defaultSchoolName = 'THPT Phạm Phú Thứ'
      const defaultGradeName = '10'
      const defaultClassName = '10.0'

      const { data: cityRow } = await svc.from('cities').select('id,name').eq('name', defaultCityName).maybeSingle()
      const cityIdToUse = cityRow?.id ? String(cityRow.id) : null
      if (!cityIdToUse) return NextResponse.json({ error: 'Không xác định được thành phố mặc định' }, { status: 400 })

      const normalizedSchool = normalizeSchoolName(defaultSchoolName)
      let schoolIdToUse: string | null = null
      const { data: schExisting } = await svc
        .from('schools')
        .select('id,name')
        .eq('city_id', cityIdToUse)
        .eq('normalized_name', normalizedSchool)
        .maybeSingle()
      if (schExisting?.id) {
        schoolIdToUse = String(schExisting.id)
      } else {
        const { data: insertedSch, error: insErr } = await svc
          .from('schools')
          .insert({
            name: defaultSchoolName,
            normalized_name: normalizedSchool,
            city_id: cityIdToUse,
            status: 'active'
          } as any)
          .select('id')
          .single()
        if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
        schoolIdToUse = String(insertedSch.id)
      }

      const { data: gradeRow } = await svc.from('grades').select('id,name').eq('name', defaultGradeName).maybeSingle()
      const gradeIdToUse = gradeRow?.id ? String(gradeRow.id) : null
      if (!gradeIdToUse) return NextResponse.json({ error: 'Không xác định được khối mặc định' }, { status: 400 })

      let finalClassId: string | null = null
      const { data: cls } = await svc
        .from('classes')
        .select('id')
        .eq('school_id', schoolIdToUse)
        .eq('grade_id', gradeIdToUse)
        .eq('academic_year_id', academic_year_id)
        .eq('name', defaultClassName)
        .maybeSingle()
      if (cls?.id) {
        finalClassId = cls.id
      } else {
        const { data: createdClass, error: cErr } = await svc
          .from('classes')
          .insert({
            school_id: schoolIdToUse,
            grade_id: gradeIdToUse,
            academic_year_id,
            name: defaultClassName
          })
          .select('id')
          .single()
        if (cErr) return NextResponse.json({ error: 'Không thể tạo lớp: ' + cErr.message }, { status: 500 })
        finalClassId = createdClass.id
      }

      const { data: schoolRow } = await svc.from('schools').select('name').eq('id', schoolIdToUse).maybeSingle()
      const { data: ayRow } = academic_year_id ? await svc.from('academic_years').select('name').eq('id', academic_year_id).maybeSingle() : { data: null }
      const payload = {
        user_id: userId,
        full_name: full_name || '',
        school_id: schoolIdToUse,
        grade_id: gradeIdToUse,
        class_id: finalClassId,
        academic_year_id,
        school: schoolRow?.name || '',
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
