import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export async function POST(req: Request, { params }: { params: { attemptId: string } }) {
  try {
    const { question_id, attempt_answer_id, report_reason, report_detail } = await req.json()
    
    if (!question_id || !report_reason) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const svc = serviceRoleClient()

    // 1. Verify attempt ownership
    const { data: attempt } = await svc
      .from('quiz_attempts')
      .select('id, user_id')
      .eq('id', params.attemptId)
      .maybeSingle()
    
    if (!attempt || attempt.user_id !== user.id) {
      return NextResponse.json({ error: 'Attempt not found or unauthorized' }, { status: 404 })
    }

    // 2. Student id = auth user id (do not depend on student_profiles.id)

    // 3. Verify question and attempt_answer association if provided
    if (attempt_answer_id) {
      const { data: answer } = await svc
        .from('quiz_attempt_answers')
        .select('question_id, attempt_id')
        .eq('id', attempt_answer_id)
        .maybeSingle()
      
      if (!answer || answer.attempt_id !== params.attemptId || answer.question_id !== question_id) {
        return NextResponse.json({ error: 'Invalid answer record' }, { status: 400 })
      }
    }

    // 4. Check if question is locked for reporting
    const { data: question } = await svc
      .from('questions')
      .select('report_locked')
      .eq('id', question_id)
      .maybeSingle()
    
    if (question?.report_locked) {
      return NextResponse.json({ error: 'Câu hỏi này đã bị khóa báo cáo.' }, { status: 403 })
    }

    // 5. Insert report
    const { data, error } = await svc
      .from('question_reports')
      .insert({
        question_id,
        attempt_id: params.attemptId,
        attempt_answer_id: attempt_answer_id || null,
        student_id: user.id,
        report_reason,
        report_detail: report_detail || '',
        status: 'pending'
      })
      .select()
      .single()

    if (error) {
      // Handle unique constraint (question_id, attempt_id, student_id)
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Bạn đã báo cáo câu hỏi này trong lượt làm bài này rồi.' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, report_id: data?.id || null, report: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
