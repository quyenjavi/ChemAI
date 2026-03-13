import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const daysParam = url.searchParams.get('days')
    const gradeNameFilter = url.searchParams.get('grade_name')
    const search = url.searchParams.get('search') || ''
    const days = daysParam ? parseInt(daysParam, 10) : undefined

    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const svc = serviceRoleClient()

    const sinceISO = days ? new Date(Date.now() - days * 24 * 3600 * 1000).toISOString() : undefined
    let qaQuery = svc.from('quiz_attempts').select('lesson_id,score_percent,created_at')
    if (sinceISO) qaQuery = qaQuery.gte('created_at', sinceISO)
    const { data: attempts } = await qaQuery

    const byLesson: Record<string, { count: number, sum: number }> = {}
    for (const a of (attempts || []) as any[]) {
      const lid = a.lesson_id
      if (!lid) continue
      const s = byLesson[lid] || { count: 0, sum: 0 }
      s.count += 1
      s.sum += (a.score_percent || 0)
      byLesson[lid] = s
    }
    const { data: lessonRows } = await svc.from('lessons').select('id,title,grade_id,created_at,is_visible')
    const gradeIds = Array.from(new Set((lessonRows || []).map((l: any) => l.grade_id).filter(Boolean)))
    const { data: grades } = gradeIds.length ? await svc.from('grades').select('id,name').in('id', gradeIds) : { data: [] }
    const gradeNameById: Record<string, string> = Object.fromEntries((grades || []).map((g: any) => [g.id, g.name || '']))

    let payload = (lessonRows || []).map((l: any) => {
      const stat = byLesson[l.id] || { count: 0, sum: 0 }
      const avg = stat.count ? Math.round((stat.sum / stat.count) * 100) / 100 : 0
      return {
        lesson_id: l.id,
        lesson_title: l.title || '',
        grade_name: gradeNameById[l.grade_id] || '',
        lesson_created_at: l.created_at || null,
        is_visible: typeof l.is_visible === 'boolean' ? l.is_visible : true,
        total_attempts: stat.count,
        avg_score_percent: avg
      }
    })

    if (gradeNameFilter) {
      payload = payload.filter(p => (p.grade_name || '') === gradeNameFilter)
    }

    if (search) {
      const sLower = search.toLowerCase()
      payload = payload.filter(p => (p.lesson_title || '').toLowerCase().includes(sLower))
    }

    const sortKey = (url.searchParams.get('sort_key') || 'total_attempts') as 'lesson_title' | 'total_attempts' | 'avg_score_percent' | 'lesson_created_at' | 'grade_name'
    const sortDir = (url.searchParams.get('sort_dir') || 'desc') as 'asc' | 'desc'
    payload.sort((a: any, b: any) => {
      let diff = 0
      switch (sortKey) {
        case 'lesson_title':
          diff = String(a.lesson_title || '').localeCompare(String(b.lesson_title || '')); break
        case 'grade_name':
          diff = String(a.grade_name || '').localeCompare(String(b.grade_name || '')); break
        case 'total_attempts':
          diff = (a.total_attempts || 0) - (b.total_attempts || 0); break
        case 'avg_score_percent':
          diff = (a.avg_score_percent || 0) - (b.avg_score_percent || 0); break
        case 'lesson_created_at':
          diff = (a.lesson_created_at ? Date.parse(a.lesson_created_at) : 0) - (b.lesson_created_at ? Date.parse(b.lesson_created_at) : 0); break
      }
      return sortDir === 'asc' ? diff : -diff
    })

    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10))
    const pageSize = Math.max(1, parseInt(url.searchParams.get('page_size') || '30', 10))
    const total = payload.length
    const start = (page - 1) * pageSize
    const end = start + pageSize
    const paged = payload.slice(start, end)

    return NextResponse.json({ lessons: paged, total, page, page_size: pageSize, scope: 'all' })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
