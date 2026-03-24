import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { lessonId } = await request.json()
    if (!lessonId) return NextResponse.json({ error: 'lessonId required' }, { status: 400 })
    const svc = serviceRoleClient()
    const { data: lesson } = await svc.from('lessons').select('lesson_type').eq('id', lessonId).maybeSingle()
    const mode = (lesson?.lesson_type === 'exam' || lesson?.lesson_type === 'practice') ? lesson.lesson_type : 'practice'

    const { data, error } = await svc
      .from('quiz_attempts')
      .insert({
        user_id: user.id,
        lesson_id: lessonId,
        mode,
        status: 'in_progress',
        raw_score: 0,
        total_score: 0,
        accuracy_correct_units: 0,
        accuracy_total_units: 0,
        accuracy_percent: 0,
        total_questions: 0,
        correct_answers: 0,
        score_percent: 0
      })
      .select('id')
      .single()

    if (error) {
      console.error('Create attempt error:', error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    console.log('Attempt created successfully:', data.id)
    return NextResponse.json({ attemptId: data.id })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
