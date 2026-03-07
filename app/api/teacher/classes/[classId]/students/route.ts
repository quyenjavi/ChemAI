import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export async function GET(_: Request, { params }: { params: { classId: string } }) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const svc = serviceRoleClient()
    const { data: tp } = await svc.from('teacher_profiles').select('id,user_id').eq('user_id', user.id).maybeSingle()
    if (!tp) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { data: assign1 } = await svc.from('teacher_class_assignments').select('class_id').eq('teacher_id', tp.id).eq('class_id', params.classId).maybeSingle()
    const { data: assign2 } = await svc.from('teacher_class_assignments').select('class_id').eq('teacher_user_id', user.id).eq('class_id', params.classId).maybeSingle()
    if (!(assign1 || assign2)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { data: students } = await svc.from('student_profiles').select('user_id,full_name,class_id').eq('class_id', params.classId)
    const userIds = Array.from(new Set((students || []).map((s: any) => s.user_id).filter(Boolean)))
    const { data: attempts } = userIds.length ? await svc
      .from('quiz_attempts')
      .select('id,user_id,score_percent,created_at')
      .in('user_id', userIds)
      .order('created_at', { ascending: false }) : { data: [] }
    const byUser: Record<string, { count: number, last: string | null, avg: number }> = {}
    for (const uid of userIds) {
      const arr = (attempts || []).filter((a: any) => a.user_id === uid)
      const count = arr.length
      const last = arr[0]?.created_at || null
      const avg = count ? Math.round((arr.reduce((sum: number, a: any) => sum + (a.score_percent || 0), 0) / count) * 10) / 10 : 0
      byUser[uid] = { count, last, avg }
    }
    const payload = (students || [])
      .map((s: any) => ({
        user_id: s.user_id,
        class_id: s.class_id,
        full_name: s.full_name || '',
        total_attempts: byUser[s.user_id]?.count || 0,
        last_attempt_at: byUser[s.user_id]?.last || null,
        avg_score_percent: byUser[s.user_id]?.avg || 0
      }))
      .sort((a: any, b: any) => String(a.full_name || '').localeCompare(String(b.full_name || '')))
    return NextResponse.json({ students: payload })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
