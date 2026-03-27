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

function isBadSchoolName(input: string) {
  const t = String(input || '').trim().toLowerCase()
  if (t.length < 5) return true
  if (/^(a+|1+|0+)$/.test(t)) return true
  if (t === 'test' || t === 'testing') return true
  if (/^\d+$/.test(t)) return true
  return false
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const email = String(body.email || '').trim()
    const password = String(body.password || '')
    const full_name = String(body.full_name || '')
    const city_id = body.city_id as string | undefined
    const selected_school_id = body.selected_school_id as string | undefined
    const school_input = String(body.school_input || '')
    const grade_id = body.grade_id as string | undefined
    const class_name = String(body.class_name || '')
    let academic_year_id = body.academic_year_id as string | undefined
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    if (!emailOk) return NextResponse.json({ error: 'Email không hợp lệ' }, { status: 400 })
    if (!password || password.length < 8) return NextResponse.json({ error: 'Mật khẩu phải có ít nhất 8 ký tự' }, { status: 400 })
    if (!full_name || !city_id || !grade_id || !class_name) {
      return NextResponse.json({ error: 'Vui lòng nhập đầy đủ Họ tên, Thành phố, Trường, Khối, Lớp' }, { status: 400 })
    }
    if (!school_input || isBadSchoolName(school_input)) {
      return NextResponse.json({ error: 'Tên trường không hợp lệ' }, { status: 400 })
    }
    const svc = serviceRoleClient()

    if (!academic_year_id) {
      const now = new Date()
      const y = now.getFullYear()
      const m = now.getMonth() + 1
      const d = now.getDate()
      const label = (m > 7 || (m === 7 && d >= 1)) ? `${y}-${y+1}` : `${y-1}-${y}`
      const { data: ay } = await svc.from('academic_years').select('id,name').eq('name', label).maybeSingle()
      academic_year_id = ay?.id
    }
    if (!academic_year_id) return NextResponse.json({ error: 'Không xác định được năm học' }, { status: 400 })

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
      const normalized = normalizeSchoolName(school_input)
      if (!normalized) return NextResponse.json({ error: 'Tên trường không hợp lệ' }, { status: 400 })

      let schoolIdToUse: string | null = null
      if (selected_school_id) {
        const { data: sch } = await svc
          .from('schools')
          .select('id,city_id')
          .eq('id', selected_school_id)
          .in('status', ['active', 'pending_review'])
          .maybeSingle()
        if (!sch) return NextResponse.json({ error: 'Trường không hợp lệ' }, { status: 400 })
        if (sch.city_id !== city_id) return NextResponse.json({ error: 'Trường không thuộc thành phố đã chọn' }, { status: 400 })
        schoolIdToUse = sch.id
      } else {
        const { data: existed } = await svc
          .from('schools')
          .select('id')
          .eq('city_id', city_id)
          .eq('normalized_name', normalized)
          .limit(1)
          .maybeSingle()
        if (existed?.id) {
          schoolIdToUse = existed.id
        } else {
          const { data: inserted, error: insErr } = await svc
            .from('schools')
            .insert({
              name: school_input.trim(),
              normalized_name: normalized,
              city_id,
              status: 'pending_review'
            })
            .select('id')
            .single()
          if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
          schoolIdToUse = inserted.id

          await svc
            .from('pending_school_matches')
            .insert({
              raw_input_name: school_input.trim(),
              normalized_input_name: normalized,
              city_id,
              temporary_school_id: schoolIdToUse,
              created_by_user_id: userId
            })
        }
      }

      if (!schoolIdToUse) return NextResponse.json({ error: 'Không xác định được trường' }, { status: 400 })

      const { count } = await svc
        .from('classes')
        .select('id', { count: 'exact', head: true })
        .eq('school_id', schoolIdToUse)
        .eq('academic_year_id', academic_year_id)

      if ((count || 0) === 0) {
        const { data: gradeRows } = await svc.from('grades').select('id,name').in('name', ['10', '11', '12'])
        const gradeIdByName: Record<string, string> = Object.fromEntries((gradeRows || []).map((g: any) => [String(g.name || ''), g.id]))
        const inserts: any[] = []
        for (const gName of ['10', '11', '12']) {
          const gId = gradeIdByName[gName]
          if (!gId) continue
          for (let i = 0; i <= 17; i++) {
            inserts.push({
              school_id: schoolIdToUse,
              grade_id: gId,
              academic_year_id,
              name: `${gName}.${i}`
            })
          }
        }
        if (inserts.length) {
          await svc.from('classes').insert(inserts)
        }
      }

      let finalClassId: string | null = null
      const { data: cls } = await svc
        .from('classes')
        .select('id')
        .eq('school_id', schoolIdToUse)
        .eq('grade_id', grade_id)
        .eq('academic_year_id', academic_year_id)
        .eq('name', class_name)
        .maybeSingle()
      if (cls?.id) {
        finalClassId = cls.id
      } else {
        const { data: createdClass, error: cErr } = await svc
          .from('classes')
          .insert({
            school_id: schoolIdToUse,
            grade_id,
            academic_year_id,
            name: class_name
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
        grade_id,
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
