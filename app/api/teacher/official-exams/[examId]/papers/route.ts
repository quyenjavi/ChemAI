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

    const { data, error } = await svc
      .from('official_exam_papers')
      .select('id,official_exam_id,paper_code,upload_order,is_master_source,process_status,verification_note,total_questions,metadata,created_at,updated_at')
      .eq('official_exam_id', params.examId)
      .order('upload_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ papers: data || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}

