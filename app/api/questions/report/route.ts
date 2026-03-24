import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  try {
    const { question_id, attempt_id, attempt_answer_id, report_reason, report_detail } = await req.json()
    
    if (!question_id || !attempt_id || !report_reason) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const svc = serviceRoleClient()

    // Student id = auth user id (do not depend on student_profiles.id)

    // Insert into question_reports
    const { data, error } = await svc
      .from('question_reports')
      .insert({
        question_id,
        attempt_id,
        attempt_answer_id: attempt_answer_id || null,
        student_id: user.id,
        report_reason,
        report_detail: report_detail || '',
        status: 'reported'
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
