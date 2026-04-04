import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export async function POST(req: Request, { params }: { params: { examId: string } }) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const paperId = String(body.paper_id || '').trim()
    if (!paperId) return NextResponse.json({ error: 'paper_id is required' }, { status: 400 })

    const svc = serviceRoleClient()
    const { data: teacher } = await svc
      .from('teacher_profiles')
      .select('user_id,can_create_exam,school_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!teacher || !teacher.can_create_exam) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: exam } = await svc.from('official_exams').select('id,school_id').eq('id', params.examId).maybeSingle()
    if (!exam || exam.school_id !== teacher.school_id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data: paper } = await svc
      .from('official_exam_papers')
      .select('id,official_exam_id')
      .eq('id', paperId)
      .eq('official_exam_id', params.examId)
      .maybeSingle()

    if (!paper) return NextResponse.json({ error: 'Paper not found' }, { status: 404 })

    await svc
      .from('official_exam_papers')
      .update({ is_master_source: false, updated_at: new Date().toISOString() } as any)
      .eq('official_exam_id', params.examId)

    const { error } = await svc
      .from('official_exam_papers')
      .update({ is_master_source: true, updated_at: new Date().toISOString() } as any)
      .eq('id', paperId)
      .eq('official_exam_id', params.examId)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    await svc
      .from('official_exam_processing_logs')
      .insert({
        official_exam_id: params.examId,
        paper_id: paperId,
        status: 'master_changed',
        message: `Set paper ${paperId} as master`,
      } as any)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}

