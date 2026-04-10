import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export const maxDuration = 300

function normalizeText(v: any) {
  return String(v ?? '').trim()
}

function toScore(v: any): number | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function typeWeight(t: string) {
  return t === 'single_choice' ? 1
    : (t === 'true_false' || t === 'true_false_group') ? 2
      : t === 'short_answer' ? 3
        : 4
}

function sortQuestions(arr: any[]) {
  return [...arr].sort((a, b) => {
    const w = typeWeight(String(a.question_type || '')) - typeWeight(String(b.question_type || ''))
    if (w !== 0) return w
    const ao = (a.order_index ?? Infinity)
    const bo = (b.order_index ?? Infinity)
    if (ao !== bo) return ao - bo
    const at = a.created_at ? Date.parse(a.created_at) : 0
    const bt = b.created_at ? Date.parse(b.created_at) : 0
    return at - bt
  })
}

function normMcq(v: any): string {
  const s = normalizeText(v).toUpperCase()
  if (['A', 'B', 'C', 'D'].includes(s)) return s
  return ''
}

function normTf(v: any): boolean | null {
  const s = normalizeText(v).toUpperCase()
  if (['TRUE', 'ĐÚNG', 'DUNG'].includes(s)) return true
  if (['FALSE', 'SAI'].includes(s)) return false
  if (s === 'T') return true
  if (s === 'F') return false
  return null
}

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const exam_id = normalizeText(body.exam_id)
    const student_code = normalizeText(body.student_code)
    if (!exam_id) return NextResponse.json({ error: 'exam_id required' }, { status: 400 })
    if (!student_code) return NextResponse.json({ error: 'student_code required' }, { status: 400 })

    const svc = serviceRoleClient()

    const { data: profile } = await svc
      .from('student_profiles')
      .select('school_id, grade_id')
      .eq('user_id', user.id)
      .maybeSingle()
    const schoolId = profile?.school_id ? String(profile.school_id) : null
    const gradeId = profile?.grade_id ? String(profile.grade_id) : null

    const { data: exam } = await svc
      .from('official_exams')
      .select('id, title, status, school_id, grade_id')
      .eq('id', exam_id)
      .maybeSingle()
    if (!exam || String(exam.status) !== 'published') return NextResponse.json({ error: 'Exam not published' }, { status: 400 })
    if (schoolId && String(exam.school_id) !== schoolId) return NextResponse.json({ error: 'Exam not in your school' }, { status: 400 })
    if (gradeId && String(exam.grade_id) !== gradeId) return NextResponse.json({ error: 'Exam not in your grade' }, { status: 400 })

    const { data: student } = await svc
      .from('official_exam_students')
      .select('id, student_code, full_name, class_name, room_name, room_no')
      .eq('official_exam_id', exam_id)
      .eq('student_code', student_code)
      .maybeSingle()
    if (!student?.id) return NextResponse.json({ error: 'Student not found in this exam' }, { status: 404 })

    const { data: sheets } = await svc
      .from('official_exam_sheets')
      .select('id, image_url, ocr_json, match_status, process_status, reviewed_at, paper_id, student_id')
      .eq('official_exam_id', exam_id)
      .eq('student_id', student.id)
      .limit(200000)

    const sheet = (() => {
      const list = (sheets || []) as any[]
      if (!list.length) return null
      let best: any = null
      for (const sh of list) {
        const s = toScore(sh?.ocr_json?.score)
        const cur = best
        const curS = toScore(cur?.ocr_json?.score)
        const choose = cur == null
          || (s != null && (curS == null || s > curS))
          || (s != null && curS != null && s === curS && (String(sh.reviewed_at || '') > String(cur.reviewed_at || '')))
        if (choose) best = sh
      }
      return best
    })()

    if (!sheet) return NextResponse.json({ error: 'No sheet found for this student' }, { status: 404 })

    let paper_code: string | null = null
    let lesson_id: string | null = null
    if (!sheet.paper_id) return NextResponse.json({ error: 'Sheet missing paper_id' }, { status: 400 })
    if (sheet?.paper_id) {
      const { data: paper } = await svc
        .from('official_exam_papers')
        .select('paper_code, lesson_id')
        .eq('id', sheet.paper_id)
        .maybeSingle()
      paper_code = paper?.paper_code ? String(paper.paper_code) : null
      lesson_id = paper?.lesson_id ? String(paper.lesson_id) : null
    }
    if (!lesson_id) return NextResponse.json({ error: 'Paper not configured: missing lesson_id' }, { status: 400 })

    const score = sheet?.ocr_json?.score ?? null

    let attempt_id: string | null = null
    if (sheet && lesson_id) {
      const answersObj = sheet?.ocr_json?.answers
      const ocrAnswers = (answersObj && typeof answersObj === 'object') ? answersObj : null
      if (!ocrAnswers) return NextResponse.json({ error: 'Sheet missing ocr_json.answers' }, { status: 400 })

      const { data: lessonRow } = await svc
        .from('lessons')
        .select('id, lesson_type')
        .eq('id', lesson_id)
        .maybeSingle()
      if (!lessonRow?.id) return NextResponse.json({ error: 'Lesson not found' }, { status: 400 })

      const mode = 'exam'

      const { data: attempt, error: attemptErr } = await svc
        .from('quiz_attempts')
        .insert({
          user_id: user.id,
          lesson_id,
          mode,
          status: 'in_progress',
          raw_score: 0,
          total_score: 0,
          accuracy_correct_units: 0,
          accuracy_total_units: 0,
          accuracy_percent: 0,
          total_questions: 0,
          correct_answers: 0,
          score_percent: 0
        } as any)
        .select('id')
        .single()
      if (attemptErr) return NextResponse.json({ error: attemptErr.message }, { status: 500 })
      attempt_id = String(attempt.id)

      const { data: questions, error: qErr } = await svc
        .from('questions')
        .select('id, question_type, order_index, created_at')
        .eq('lesson_id', lesson_id)
        .limit(2000)
      if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })
      const ordered = sortQuestions((questions || []) as any[])
      if (!ordered.length) return NextResponse.json({ error: 'Lesson has no questions' }, { status: 400 })

      await svc.from('quiz_attempt_questions').insert(ordered.map((q: any) => ({ attempt_id, question_id: q.id } as any)))

      const tfGroupQIds = ordered.filter((q: any) => q.question_type === 'true_false_group').map((q: any) => String(q.id))
      const statementsByQ: Record<string, any[]> = {}
      if (tfGroupQIds.length) {
        const { data: stRows, error: stErr } = await svc
          .from('question_statements')
          .select('id, question_id, sort_order')
          .in('question_id', tfGroupQIds)
          .order('sort_order', { ascending: true })
        if (stErr) return NextResponse.json({ error: stErr.message }, { status: 500 })
        for (const r of (stRows || []) as any[]) {
          const qid = String(r.question_id || '')
          if (!qid) continue
          const arr = statementsByQ[qid] || []
          arr.push({ id: String(r.id), sort_order: r.sort_order ?? 0 })
          statementsByQ[qid] = arr
        }
      }

      const answersPayload: Array<any> = []
      let mcqIdx = 1
      let saIdx = 1
      let tfGroupIdx = 1

      for (const q of ordered) {
        const qid = String(q.id)
        const typ = String(q.question_type || '')

        if (typ === 'single_choice') {
          const key = `mcq_${mcqIdx}`
          mcqIdx += 1
          const picked = normMcq((ocrAnswers as any)[key])
          answersPayload.push({ questionId: qid, selected_answer: picked })
          continue
        }

        if (typ === 'short_answer') {
          const key = `sa_${saIdx}`
          saIdx += 1
          const txt = normalizeText((ocrAnswers as any)[key])
          answersPayload.push({ questionId: qid, answer_text: txt })
          continue
        }

        if (typ === 'true_false_group') {
          const st = (statementsByQ[qid] || []).slice().sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          const letters = ['a', 'b', 'c', 'd']
          const statement_answers: Record<string, boolean | null> = {}
          for (let i = 0; i < st.length; i += 1) {
            const sid = String(st[i].id)
            const letter = letters[i] || null
            if (!letter) continue
            const key = `tf_${tfGroupIdx}_${letter}`
            statement_answers[sid] = normTf((ocrAnswers as any)[key])
          }
          tfGroupIdx += 1
          answersPayload.push({ questionId: qid, statement_answers })
          continue
        }

        answersPayload.push({ questionId: qid })
      }

      const origin = new URL(req.url).origin
      const cookie = req.headers.get('cookie') || ''
      const submitRes = await fetch(`${origin}/api/attempts/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie },
        body: JSON.stringify({ attemptId: attempt_id, answers: answersPayload })
      })
      const submitJson = await submitRes.json().catch(() => ({}))
      if (!submitRes.ok) {
        return NextResponse.json({ error: submitJson.error || 'Submit failed' }, { status: 500 })
      }
    }

    let attemptInfo: any = null
    if (attempt_id) {
      const { data: attRow } = await svc
        .from('quiz_attempts')
        .select('id, raw_score, total_score, status')
        .eq('id', attempt_id)
        .maybeSingle()
      attemptInfo = {
        attempt_id,
        lesson_id,
        url: `/attempt/${attempt_id}/result`,
        raw_score: attRow?.raw_score ?? null,
        total_score: attRow?.total_score ?? null,
        status: attRow?.status ?? null
      }
    }

    return NextResponse.json({
      exam: { id: String(exam.id), title: String(exam.title || '') },
      student: {
        student_code: String(student.student_code || ''),
        full_name: String(student.full_name || ''),
        class_name: String(student.class_name || ''),
        room_name: student.room_name ? String(student.room_name) : null,
        room_no: student.room_no ? String(student.room_no) : null
      },
      result: sheet ? {
        sheet_id: String(sheet.id),
        paper_code,
        score,
        image_url: sheet.image_url ? String(sheet.image_url) : null,
        match_status: sheet.match_status || null,
        process_status: sheet.process_status || null
      } : null,
      attempt: attemptInfo
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
