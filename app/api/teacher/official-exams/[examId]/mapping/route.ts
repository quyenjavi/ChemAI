import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export async function GET(_: Request, { params }: { params: { examId: string } }) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const svc = serviceRoleClient()
    const { data: teacher } = await svc
      .from('teacher_profiles')
      .select('user_id,can_create_exam,school_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!teacher || !teacher.can_create_exam) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: exam } = await svc.from('official_exams').select('id,school_id').eq('id', params.examId).maybeSingle()
    if (!exam || exam.school_id !== teacher.school_id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data: papers } = await svc
      .from('official_exam_papers')
      .select('id,paper_code,upload_order,is_master_source,total_questions,process_status')
      .eq('official_exam_id', params.examId)
      .order('upload_order', { ascending: true })

    const { data: masters } = await svc
      .from('official_exam_master_questions')
      .select('id,official_exam_id,master_question_no,question_id,score,created_at')
      .eq('official_exam_id', params.examId)
      .order('master_question_no', { ascending: true })

    const { data: maps } = await svc
      .from('official_exam_paper_question_map')
      .select('id,official_exam_id,paper_id,paper_question_no,master_question_id,master_question_no,question_id,confidence,created_at')
      .eq('official_exam_id', params.examId)
      .order('paper_question_no', { ascending: true })

    return NextResponse.json({ papers: papers || [], master_questions: masters || [], mappings: maps || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}

