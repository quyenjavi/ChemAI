import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export async function POST(_: Request, { params }: { params: { lessonId: string, questionId: string } }) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const svc = serviceRoleClient()
    const { data: teacher } = await svc.from('teacher_profiles').select('id').eq('user_id', user.id).maybeSingle()
    if (!teacher) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: q } = await svc
      .from('questions')
      .select('id,lesson_id')
      .eq('id', params.questionId)
      .eq('lesson_id', params.lessonId)
      .maybeSingle()
    if (!q) return NextResponse.json({ error: 'Question not found' }, { status: 404 })

    await svc.from('question_options').delete().eq('question_id', params.questionId)
    await svc.from('question_statements').delete().eq('question_id', params.questionId)
    await svc.from('question_short_answers').delete().eq('question_id', params.questionId)

    const del = await svc.from('questions').delete().eq('id', params.questionId).eq('lesson_id', params.lessonId)
    if (del.error) return NextResponse.json({ error: del.error.message }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}

