import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

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
    const supabase = createSupabaseServer()
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const body = await request.json()
    const payload: any = {
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

    const school_input = String(body.school_input || '').trim()
    const city_id = body.city_id == null ? null : String(body.city_id)
    const selected_school_id = body.selected_school_id == null ? null : String(body.selected_school_id)

    if (school_input) {
      if (!city_id) return NextResponse.json({ error: 'Thiếu thành phố' }, { status: 400 })
      if (isBadSchoolName(school_input)) return NextResponse.json({ error: 'Tên trường không hợp lệ' }, { status: 400 })

      if (selected_school_id) {
        const { data: sch, error: schErr } = await svc
          .from('schools')
          .select('id, city_id, status, merged_into_school_id')
          .eq('id', selected_school_id)
          .in('status', ['active', 'pending_review'])
          .maybeSingle()
        if (schErr) return NextResponse.json({ error: schErr.message }, { status: 500 })
        if (!sch?.id) return NextResponse.json({ error: 'Trường không hợp lệ' }, { status: 400 })
        if (String(sch.city_id || '') !== city_id) return NextResponse.json({ error: 'Trường không thuộc thành phố đã chọn' }, { status: 400 })
        payload.school_id = String(sch.merged_into_school_id || sch.id)
      } else {
        const normalized = normalizeSchoolName(school_input)
        const { data: existed, error: exErr } = await svc
          .from('schools')
          .select('id, merged_into_school_id')
          .eq('city_id', city_id)
          .eq('normalized_name', normalized)
          .in('status', ['active', 'pending_review'])
          .maybeSingle()
        if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 })
        if (existed?.id) {
          payload.school_id = String(existed.merged_into_school_id || existed.id)
        } else {
          const { data: inserted, error: insErr } = await svc
            .from('schools')
            .insert({
              name: school_input,
              normalized_name: normalized,
              city_id,
              status: 'pending_review'
            } as any)
            .select('id')
            .single()
          if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
          payload.school_id = String(inserted.id)
          const pmRes = await svc.from('pending_school_matches').insert({
            raw_input_name: school_input,
            normalized_input_name: normalized,
            city_id,
            temporary_school_id: inserted.id,
            created_by_user_id: user.id
          } as any)
          void pmRes
        }
      }
    }

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

    const class_name = String(body.class_name || '').trim()
    if (payload.school_id && payload.grade_id && payload.academic_year_id && class_name) {
      const { data: cls } = await svc
        .from('classes')
        .select('id')
        .eq('school_id', payload.school_id)
        .eq('grade_id', payload.grade_id)
        .eq('academic_year_id', payload.academic_year_id)
        .eq('name', class_name)
        .maybeSingle()
      if (cls?.id) {
        payload.class_id = cls.id
      } else {
        const { data: created, error: cErr } = await svc
          .from('classes')
          .insert({
            school_id: payload.school_id,
            grade_id: payload.grade_id,
            academic_year_id: payload.academic_year_id,
            name: class_name
          } as any)
          .select('id')
          .single()
        if (cErr) return NextResponse.json({ error: 'Không thể tạo lớp: ' + cErr.message }, { status: 400 })
        payload.class_id = created.id
      }
    }

    if (payload.school_id) {
      const { data: sch } = await svc.from('schools').select('name').eq('id', payload.school_id).maybeSingle()
      if (sch?.name) payload.school = String(sch.name)
    }
    if (payload.academic_year_id) {
      const { data: ay2 } = await svc.from('academic_years').select('name').eq('id', payload.academic_year_id).maybeSingle()
      if (ay2?.name) payload.academic_year = String(ay2.name)
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
