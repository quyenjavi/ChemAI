import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

function parseAnswerMapFromText(text: string) {
  const s = String(text || '').trim()
  if (!s) return null
  const out: Record<string, string> = {}
  const tokens = s
    .replace(/\r/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/;/g, ' ')
    .replace(/,/g, ' ')
    .split(/\s+/)
    .map(x => x.trim())
    .filter(Boolean)
  for (const t of tokens) {
    const m = t.match(/^(\d+)([A-D])$/i)
    if (!m) continue
    out[m[1]] = m[2].toUpperCase()
  }
  return Object.keys(out).length ? out : null
}

export const maxDuration = 300

export async function POST(_: Request, { params }: { params: { examId: string } }) {
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

    const { data: exam } = await svc
      .from('official_exams')
      .select('id,school_id')
      .eq('id', params.examId)
      .maybeSingle()
    if (!exam || exam.school_id !== teacher.school_id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const nowIso = new Date().toISOString()

    const { data: papers } = await svc
      .from('official_exam_papers')
      .select('id,paper_code,is_master_source,metadata')
      .eq('official_exam_id', params.examId)
      .order('upload_order', { ascending: true })
    const masterPaper = (papers || []).find((p: any) => !!p.is_master_source) || (papers || [])[0]
    const masterAnswerKey = (masterPaper as any)?.metadata?.answer_key || null

    const { data: masters } = await svc
      .from('official_exam_master_questions')
      .select('id,master_question_no,score,question_id')
      .eq('official_exam_id', params.examId)
      .order('master_question_no', { ascending: true })
    const masterIdByNo: Record<number, string> = {}
    const masterScoreByNo: Record<number, number> = {}
    const masterQuestionIdByNo: Record<number, string | null> = {}
    for (const m of masters || []) {
      const no = Number((m as any).master_question_no)
      masterIdByNo[no] = String((m as any).id)
      masterScoreByNo[no] = Number((m as any).score || 0)
      masterQuestionIdByNo[no] = (m as any).question_id || null
    }

    const { data: sheets } = await svc
      .from('official_exam_sheets')
      .select('id,student_id,paper_id,match_status,process_status,metadata')
      .eq('official_exam_id', params.examId)
      .eq('match_status', 'matched')
      .limit(500)

    if (!sheets || sheets.length === 0) {
      return NextResponse.json({ ok: true, graded: 0, skipped: 0 })
    }

    const paperIds = Array.from(new Set(sheets.map((s: any) => s.paper_id).filter(Boolean)))
    const { data: mappingRows } = paperIds.length ? await svc
      .from('official_exam_paper_question_map')
      .select('paper_id,paper_question_no,master_question_id,master_question_no,question_id')
      .eq('official_exam_id', params.examId)
      .in('paper_id', paperIds)
      : { data: [] }

    const mappingByPaper: Record<string, Record<number, { master_question_id: string | null, master_question_no: number | null, question_id: string | null }>> = {}
    for (const r of mappingRows || []) {
      const pid = String((r as any).paper_id)
      const pq = Number((r as any).paper_question_no)
      mappingByPaper[pid] = mappingByPaper[pid] || {}
      mappingByPaper[pid][pq] = {
        master_question_id: (r as any).master_question_id || null,
        master_question_no: (r as any).master_question_no == null ? null : Number((r as any).master_question_no),
        question_id: (r as any).question_id || null,
      }
    }

    const studentIds = Array.from(new Set(sheets.map((s: any) => s.student_id).filter(Boolean)))
    const { data: existingAttempts } = studentIds.length ? await svc
      .from('official_exam_attempts')
      .select('id,student_id')
      .eq('official_exam_id', params.examId)
      .in('student_id', studentIds)
      : { data: [] }

    const attemptByStudentId: Record<string, any> = {}
    for (const a of existingAttempts || []) {
      attemptByStudentId[String((a as any).student_id)] = a
    }

    let graded = 0
    let skipped = 0

    for (const sh of sheets as any[]) {
      const studentId = sh.student_id as string | null
      const paperId = sh.paper_id as string | null
      if (!studentId || !paperId) { skipped += 1; continue }
      if (attemptByStudentId[studentId]) { skipped += 1; continue }

      const { data: attempt, error: attemptErr } = await svc
        .from('official_exam_attempts')
        .insert({
          official_exam_id: params.examId,
          student_id: studentId,
          paper_id: paperId,
          sheet_id: sh.id,
          status: 'grading',
          total_score: 0,
          correct_count: 0,
          incorrect_count: 0,
          blank_count: 0,
          created_at: nowIso,
          updated_at: nowIso,
        } as any)
        .select('*')
        .single()
      if (attemptErr) return NextResponse.json({ error: attemptErr.message }, { status: 400 })
      attemptByStudentId[studentId] = attempt

      const answerMap = (sh.metadata?.answer_map && typeof sh.metadata.answer_map === 'object')
        ? (sh.metadata.answer_map as Record<string, string>)
        : parseAnswerMapFromText(String(sh.metadata?.answers_text || '')) || {}

      const paperMapping = mappingByPaper[paperId] || {}
      const questionNos = Object.keys(paperMapping).map(x => parseInt(x, 10)).filter(Boolean).sort((a, b) => a - b)
      const attemptAnswers: any[] = []

      let correct = 0
      let incorrect = 0
      let blank = 0
      let totalScore = 0

      for (const paperQuestionNo of questionNos) {
        const map = paperMapping[paperQuestionNo]
        const masterNo = map?.master_question_no
        const selected = answerMap[String(paperQuestionNo)] || null
        const correctAnswer = masterNo && masterAnswerKey ? (masterAnswerKey[String(masterNo)] || null) : null
        const scoreEach = masterNo ? (masterScoreByNo[masterNo] || 0) : 0
        const isCorrect = selected && correctAnswer ? selected === correctAnswer : null

        let scoreAwarded = 0
        if (isCorrect === true) scoreAwarded = scoreEach

        if (!selected) blank += 1
        else if (isCorrect === true) correct += 1
        else incorrect += 1

        totalScore += scoreAwarded

        attemptAnswers.push({
          attempt_id: attempt.id,
          official_exam_id: params.examId,
          paper_id: paperId,
          student_id: studentId,
          sheet_id: sh.id,
          paper_question_no: paperQuestionNo,
          master_question_id: masterNo ? (masterIdByNo[masterNo] || map?.master_question_id || null) : (map?.master_question_id || null),
          question_id: masterNo ? (masterQuestionIdByNo[masterNo] || map?.question_id || null) : (map?.question_id || null),
          selected_answer: selected,
          correct_answer: correctAnswer,
          is_correct: isCorrect,
          score_awarded: scoreAwarded,
          answer_source: sh.metadata?.answer_map ? 'manual_map' : 'manual_text',
          review_status: 'none',
          created_at: nowIso,
          updated_at: nowIso,
        })
      }

      if (attemptAnswers.length) {
        const { error: ansErr } = await svc.from('official_exam_attempt_answers').insert(attemptAnswers as any)
        if (ansErr) return NextResponse.json({ error: ansErr.message }, { status: 400 })
      }

      const { error: updErr } = await svc
        .from('official_exam_attempts')
        .update({
          status: 'graded',
          total_score: Math.round(totalScore * 100) / 100,
          correct_count: correct,
          incorrect_count: incorrect,
          blank_count: blank,
          updated_at: nowIso,
        } as any)
        .eq('id', attempt.id)
      if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 })

      await svc
        .from('official_exam_sheets')
        .update({ process_status: 'graded', updated_at: nowIso } as any)
        .eq('id', sh.id)

      await svc
        .from('official_exam_processing_logs')
        .insert({
          official_exam_id: params.examId,
          attempt_id: attempt.id,
          sheet_id: sh.id,
          status: 'graded',
          message: `Graded attempt ${attempt.id}`,
          created_at: nowIso,
        } as any)

      graded += 1
    }

    const { count: totalGraded } = await svc
      .from('official_exam_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('official_exam_id', params.examId)
      .eq('status', 'graded')

    await svc
      .from('official_exams')
      .update({ total_graded: totalGraded || 0, updated_at: nowIso, status: 'graded' } as any)
      .eq('id', params.examId)

    return NextResponse.json({ ok: true, graded, skipped, has_answer_key: !!masterAnswerKey })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}

