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

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const cityId = String(url.searchParams.get('city_id') || '').trim()
    const keyword = String(url.searchParams.get('keyword') || '').trim()

    if (!cityId) return NextResponse.json({ error: 'city_id is required' }, { status: 400 })
    if (!keyword) return NextResponse.json({ schools: [] })

    const needle = normalizeSchoolName(keyword)
    if (!needle) return NextResponse.json({ schools: [] })

    const svc = serviceRoleClient()
    const { data, error } = await svc
      .from('schools')
      .select('id,name,normalized_name,city_id,status,merged_into_school_id')
      .eq('city_id', cityId)
      .in('status', ['active', 'pending_review'])
      .ilike('normalized_name', `%${needle}%`)
      .limit(30)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const sorted = [...(data || [])].sort((a: any, b: any) => {
      const wa = a.status === 'active' ? 0 : 1
      const wb = b.status === 'active' ? 0 : 1
      if (wa !== wb) return wa - wb
      return String(a.name || '').localeCompare(String(b.name || ''))
    })

    return NextResponse.json({ schools: sorted.slice(0, 10) })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}

