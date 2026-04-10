import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = serviceRoleClient()
  const { data: profile } = await svc
    .from('student_profiles')
    .select('school_id, grade_id')
    .eq('user_id', user.id)
    .maybeSingle()

  const schoolId = profile?.school_id ? String(profile.school_id) : null
  const gradeId = profile?.grade_id ? String(profile.grade_id) : null
  if (!schoolId || !gradeId) return NextResponse.json({ items: [] })

  const { data: exams, error } = await svc
    .from('official_exams')
    .select('id, title, exam_date, status, school_id, grade_id, published_at')
    .eq('school_id', schoolId)
    .eq('grade_id', gradeId)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    items: (exams || []).map((e: any) => ({
      id: String(e.id),
      title: String(e.title || ''),
      exam_date: e.exam_date || null,
      published_at: e.published_at || null
    }))
  })
}

