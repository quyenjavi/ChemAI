import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

function round2(n: number) {
  return Math.round(n * 100) / 100
}

export async function POST(req: Request, { params }: { params: { examId: string } }) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const totalQuestions = Math.max(0, parseInt(String(body.total_questions || '0'), 10) || 0)
    const force = !!body.force
    if (!totalQuestions) return NextResponse.json({ error: 'total_questions is required' }, { status: 400 })

    const svc = serviceRoleClient()
    const { data: teacher } = await svc
      .from('teacher_profiles')
      .select('user_id,can_create_exam,school_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!teacher || !teacher.can_create_exam) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: exam } = await svc.from('official_exams').select('id,school_id').eq('id', params.examId).maybeSingle()
    if (!exam || exam.school_id !== teacher.school_id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { count: existingMasters } = await svc
      .from('official_exam_master_questions')
      .select('id', { count: 'exact', head: true })
      .eq('official_exam_id', params.examId)
    if ((existingMasters || 0) > 0 && !force) {
      return NextResponse.json({ error: 'Master questions already initialized' }, { status: 400 })
    }

    const nowIso = new Date().toISOString()

    if (force) {
      await svc.from('official_exam_paper_question_map').delete().eq('official_exam_id', params.examId)
      await svc.from('official_exam_master_questions').delete().eq('official_exam_id', params.examId)
    }

    const { data: papers } = await svc
      .from('official_exam_papers')
      .select('id,upload_order,is_master_source')
      .eq('official_exam_id', params.examId)
      .order('upload_order', { ascending: true })

    if (!papers || papers.length === 0) {
      return NextResponse.json({ error: 'Upload papers first' }, { status: 400 })
    }

    const masterPaper = papers.find((p: any) => !!p.is_master_source) || papers[0]

    const scoreEach = round2(10 / totalQuestions)
    const masterRows = Array.from({ length: totalQuestions }).map((_, idx) => ({
      official_exam_id: params.examId,
      master_question_no: idx + 1,
      question_id: null,
      score: scoreEach,
      created_at: nowIso,
    }))

    const { data: insertedMasters, error: insErr } = await svc
      .from('official_exam_master_questions')
      .insert(masterRows as any)
      .select('id,master_question_no')

    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 })

    const masterIdByNo: Record<number, string> = {}
    for (const r of insertedMasters || []) {
      masterIdByNo[Number((r as any).master_question_no)] = String((r as any).id)
    }

    const mappingRows: any[] = []
    for (const p of papers) {
      for (let q = 1; q <= totalQuestions; q++) {
        mappingRows.push({
          official_exam_id: params.examId,
          paper_id: p.id,
          paper_question_no: q,
          master_question_id: masterIdByNo[q] || null,
          master_question_no: q,
          question_id: null,
          confidence: p.id === masterPaper.id ? 1 : 0.5,
          created_at: nowIso,
        })
      }
    }

    const { error: mapErr } = await svc.from('official_exam_paper_question_map').insert(mappingRows as any)
    if (mapErr) return NextResponse.json({ error: mapErr.message }, { status: 400 })

    await svc
      .from('official_exam_papers')
      .update({ total_questions: totalQuestions, updated_at: nowIso } as any)
      .eq('official_exam_id', params.examId)
      .eq('id', masterPaper.id)

    await svc
      .from('official_exam_processing_logs')
      .insert({
        official_exam_id: params.examId,
        paper_id: masterPaper.id,
        status: 'mapping_initialized',
        message: `Initialized master questions: ${totalQuestions}`,
        created_at: nowIso,
      } as any)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}

