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
      .from('official_exam_sheets')
      .select(`
        id,
        official_exam_id,
        batch_id,
        student_id,
        paper_id,
        detected_student_code,
        detected_paper_code,
        match_status,
        process_status,
        storage_bucket,
        storage_path,
        metadata,
        created_at,
        updated_at,
        batch:official_exam_sheet_batches(id,batch_name),
        student:official_exam_students(id,student_code,full_name),
        paper:official_exam_papers(id,paper_code)
      `)
      .eq('official_exam_id', params.examId)
      .order('created_at', { ascending: false })
      .limit(500)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ sheets: data || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}

