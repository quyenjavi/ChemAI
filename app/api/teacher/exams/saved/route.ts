import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const svc = serviceRoleClient()
    const { data: teacher } = await svc
      .from('teacher_profiles')
      .select('user_id,can_create_exam')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!teacher || !teacher.can_create_exam) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: exams, error } = await svc
      .from('exams')
      .select('id,title,description,grade_id,status,created_at,updated_at')
      .eq('created_by', user.id)
      .eq('status', 'saved')
      .order('updated_at', { ascending: false })
      .limit(100)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const { data: matrix_exams, error: mxErr } = await svc
      .from('generated_exams')
      .select('id,title,lesson_id,lesson_ids,is_published,created_at,total_questions,total_score,published_lesson_id,published_at')
      .eq('created_by', user.id)
      .eq('is_published', false)
      .order('created_at', { ascending: false })
      .limit(100)
    if (mxErr) return NextResponse.json({ error: mxErr.message }, { status: 500 })

    const { data: matrix_published, error: mpErr } = await svc
      .from('generated_exams')
      .select('id,title,lesson_id,lesson_ids,is_published,created_at,total_questions,total_score,published_lesson_id,published_at')
      .eq('created_by', user.id)
      .eq('is_published', true)
      .order('published_at', { ascending: false })
      .limit(100)
    if (mpErr) return NextResponse.json({ error: mpErr.message }, { status: 500 })

    return NextResponse.json({ exams: exams || [], matrix_exams: matrix_exams || [], matrix_published: matrix_published || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
