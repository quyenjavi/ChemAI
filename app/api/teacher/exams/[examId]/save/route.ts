import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export async function POST(_: Request, { params }: { params: { examId: string } }) {
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

    const { data: exam } = await svc
      .from('exams')
      .select('id,created_by,status')
      .eq('id', params.examId)
      .maybeSingle()
    if (!exam || exam.created_by !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (exam.status === 'published') return NextResponse.json({ error: 'Exam already published' }, { status: 400 })

    const nowIso = new Date().toISOString()
    const { error } = await svc
      .from('exams')
      .update({ status: 'saved', updated_at: nowIso })
      .eq('id', params.examId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
