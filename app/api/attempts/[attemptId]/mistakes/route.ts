import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export async function GET(_: Request, { params }: { params: { attemptId: string } }) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const svc = serviceRoleClient()
    const { data: att } = await svc.from('quiz_attempts').select('id,user_id').eq('id', params.attemptId).maybeSingle()
    if (!att || att.user_id !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const { data: rows } = await svc
      .from('mistakes')
      .select('question_id, brief_question, chosen_answer, correct_answer, explanation, tip, created_at')
      .eq('attempt_id', params.attemptId)
      .order('created_at', { ascending: true })
    return NextResponse.json({ mistakes: rows || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
