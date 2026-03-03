import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const { lessonId } = await request.json()
    if (!lessonId) {
      return NextResponse.json({ error: 'lessonId required' }, { status: 400 })
    }
    const supabase = createSupabaseServer()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const svc = serviceRoleClient()
    const { data, error } = await svc.from('quiz_attempts').insert({
      user_id: user.id,
      lesson_id: lessonId,
      total_questions: 0,
      correct_answers: 0,
      score_percent: 0
    }).select('id').single()
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ attemptId: data.id })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
