import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export async function POST(req: Request, { params }: { params: { examId: string } }) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const paperId = String(body.paper_id || '').trim()
    const paperQuestionNo = parseInt(String(body.paper_question_no || '0'), 10) || 0
    const masterQuestionNo = parseInt(String(body.master_question_no || '0'), 10) || 0
    const confidence = body.confidence == null ? null : Number(body.confidence)

    if (!paperId) return NextResponse.json({ error: 'paper_id is required' }, { status: 400 })
    if (!paperQuestionNo) return NextResponse.json({ error: 'paper_question_no is required' }, { status: 400 })
    if (!masterQuestionNo) return NextResponse.json({ error: 'master_question_no is required' }, { status: 400 })

    const svc = serviceRoleClient()
    const { data: teacher } = await svc
      .from('teacher_profiles')
      .select('user_id,can_create_exam,school_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!teacher || !teacher.can_create_exam) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: exam } = await svc.from('official_exams').select('id,school_id').eq('id', params.examId).maybeSingle()
    if (!exam || exam.school_id !== teacher.school_id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data: master } = await svc
      .from('official_exam_master_questions')
      .select('id,question_id')
      .eq('official_exam_id', params.examId)
      .eq('master_question_no', masterQuestionNo)
      .maybeSingle()

    if (!master) return NextResponse.json({ error: 'Master question not found' }, { status: 404 })

    const nowIso = new Date().toISOString()
    const payload = {
      official_exam_id: params.examId,
      paper_id: paperId,
      paper_question_no: paperQuestionNo,
      master_question_id: master.id,
      master_question_no: masterQuestionNo,
      question_id: master.question_id || null,
      confidence: confidence == null ? 1 : confidence,
      created_at: nowIso,
    }

    const { data, error } = await svc
      .from('official_exam_paper_question_map')
      .upsert(payload as any, { onConflict: 'official_exam_id,paper_id,paper_question_no' } as any)
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    await svc
      .from('official_exam_processing_logs')
      .insert({
        official_exam_id: params.examId,
        paper_id: paperId,
        status: 'mapping_updated',
        message: `paper_question_no ${paperQuestionNo} -> master_question_no ${masterQuestionNo}`,
        created_at: nowIso,
      } as any)

    return NextResponse.json({ mapping: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}

