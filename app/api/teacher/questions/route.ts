import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10))
    const pageSize = Math.max(1, parseInt(url.searchParams.get('page_size') || '30', 10))
    const sortKey = (url.searchParams.get('sort_key') || 'total_attempts') as 'total_attempts' | 'correct_rate' | 'created_at' | 'grade_name' | 'lesson_title'
    const sortDir = (url.searchParams.get('sort_dir') || 'desc') as 'asc' | 'desc'
    const gradeNameFilter = url.searchParams.get('grade_name') || ''
    const lessonIdFilter = url.searchParams.get('lesson_id') || ''
    const typeFilter = url.searchParams.get('question_type') || ''
    const difficultyFilter = url.searchParams.get('difficulty') || ''
    const search = url.searchParams.get('search') || ''

    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const svc = serviceRoleClient()
    const { data: tp } = await svc.from('teacher_profiles').select('id,school_id').eq('user_id', user.id).maybeSingle()
    if (!tp?.school_id) return NextResponse.json({ questions: [], total: 0, page, page_size: pageSize })
    const { data: school } = await svc.from('schools').select('id,name').eq('id', tp.school_id).maybeSingle()

    const { data: students } = await svc.from('student_profiles').select('user_id').eq('school_id', tp.school_id)
    const userIds = Array.from(new Set((students || []).map((s: any) => s.user_id).filter(Boolean)))
    if (userIds.length === 0) return NextResponse.json({ questions: [], total: 0, page, page_size: pageSize, school_name: school?.name || '', debug: { students_count: 0, attempts_count: 0, answers_count: 0, question_ids_count: 0 } })

    const { data: attempts } = await svc.from('quiz_attempts').select('id,user_id,lesson_id').in('user_id', userIds)
    const attemptIds = Array.from(new Set((attempts || []).map((a: any) => a.id).filter(Boolean)))
    if (attemptIds.length === 0) return NextResponse.json({ questions: [], total: 0, page, page_size: pageSize, school_name: school?.name || '', debug: { students_count: userIds.length, attempts_count: 0, answers_count: 0, question_ids_count: 0 } })

    const { data: answers } = await svc.from('quiz_attempt_answers').select('id,question_id,is_correct,attempt_id').in('attempt_id', attemptIds)
    const byQuestion: Record<string, { total: number, correct: number }> = {}
    for (const r of (answers || []) as any[]) {
      const qid = r.question_id
      if (!qid) continue
      const st = byQuestion[qid] || { total: 0, correct: 0 }
      st.total += 1
      if (r.is_correct === true) st.correct += 1
      byQuestion[qid] = st
    }
    let questionIds = Object.keys(byQuestion)
    const lessonIdsFromAttempts = Array.from(new Set((attempts || []).map((a: any) => a.lesson_id).filter(Boolean)))

    let allowedLessonIds: string[] = []
    if (lessonIdFilter) {
      allowedLessonIds = [lessonIdFilter]
    } else if (gradeNameFilter) {
      const { data: allLessons } = await svc.from('lessons').select('id,title,grade_id')
      const { data: allGrades } = await svc.from('grades').select('id,name')
      const gradeIndex: Record<string, string> = Object.fromEntries((allGrades || []).map((g: any) => [g.id, g.name || '']))
      allowedLessonIds = (allLessons || []).filter((l: any) => (gradeIndex[l.grade_id] || '') === gradeNameFilter).map((l: any) => l.id)
    } else if (lessonIdsFromAttempts.length) {
      allowedLessonIds = lessonIdsFromAttempts
    }
    let qQuery = svc.from('questions').select('id,content,question_type,correct_answer,choice_a,choice_b,choice_c,choice_d,explanation,difficulty,topic,lesson_id,created_at')
    if (allowedLessonIds.length) {
      qQuery = qQuery.in('lesson_id', allowedLessonIds)
    } else if (questionIds.length) {
      qQuery = qQuery.in('id', questionIds)
    }
    if (typeFilter) qQuery = qQuery.eq('question_type', typeFilter)
    if (difficultyFilter) qQuery = qQuery.eq('difficulty', difficultyFilter)
    const { data: qRows } = await qQuery
    const lessonIds = Array.from(new Set((qRows || []).map((q: any) => q.lesson_id).filter(Boolean)))
    const { data: lessons } = lessonIds.length ? await svc.from('lessons').select('id,title,grade_id').in('id', lessonIds) : { data: [] }
    const gradeIds = Array.from(new Set((lessons || []).map((l: any) => l.grade_id).filter(Boolean)))
    const { data: grades } = gradeIds.length ? await svc.from('grades').select('id,name').in('id', gradeIds) : { data: [] }
    const titleByLesson: Record<string, string> = Object.fromEntries((lessons || []).map((l: any) => [l.id, l.title || '']))
    const gradeByLesson: Record<string, string> = Object.fromEntries((lessons || []).map((l: any) => [l.id, (grades || []).find((g: any) => g.id === l.grade_id)?.name || '']))

    const { data: qOpts } = await svc.from('question_options').select('question_id,option_key,option_text,is_correct,sort_order').in('question_id', (qRows || []).map((x: any) => x.id)).order('sort_order', { ascending: true })
    const optsByQuestion: Record<string, any[]> = {}
    for (const o of (qOpts || []) as any[]) {
      const arr = optsByQuestion[o.question_id] || []
      arr.push({ key: o.option_key, text: o.option_text, is_correct: !!o.is_correct, order: o.sort_order ?? 0 })
      optsByQuestion[o.question_id] = arr
    }
    const shortIds = (qRows || []).filter((q: any) => String(q.question_type || '') === 'short_answer').map((q: any) => q.id)
    const { data: shortRows } = shortIds.length ? await svc.from('question_short_answers').select('question_id,answer_text').in('question_id', shortIds) : { data: [] }
    const shortByQuestion: Record<string, string> = {}
    for (const s of (shortRows || []) as any[]) {
      if (!shortByQuestion[s.question_id]) shortByQuestion[s.question_id] = s.answer_text || ''
    }

    let payload = (qRows || []).map((q: any) => {
      const st = byQuestion[q.id] || { total: 0, correct: 0 }
      const rate = st.total ? Math.round((100 * st.correct / st.total) * 100) / 100 : 0
      const lessonTitle = titleByLesson[q.lesson_id] || ''
      const gradeName = gradeByLesson[q.lesson_id] || ''
      const options = (optsByQuestion[q.id] && optsByQuestion[q.id].length) ? optsByQuestion[q.id] : [
        { key: 'A', text: q.choice_a || '', is_correct: String(q.correct_answer || '').toUpperCase() === 'A', order: 1 },
        { key: 'B', text: q.choice_b || '', is_correct: String(q.correct_answer || '').toUpperCase() === 'B', order: 2 },
        { key: 'C', text: q.choice_c || '', is_correct: String(q.correct_answer || '').toUpperCase() === 'C', order: 3 },
        { key: 'D', text: q.choice_d || '', is_correct: String(q.correct_answer || '').toUpperCase() === 'D', order: 4 },
      ].filter(x => x.text)
      return {
        question_id: q.id,
        lesson_id: q.lesson_id || '',
        question_content: q.content || '',
        question_type: q.question_type || '',
        lesson_title: lessonTitle,
        grade_name: gradeName,
        total_attempts: st.total,
        correct_rate: rate,
        question_created_at: q.created_at || null,
        difficulty: q.difficulty || '',
        topic: q.topic || '',
        options,
        explanation: q.explanation || '',
        correct_key: String(q.correct_answer || '').toUpperCase(),
        correct_text: String(q.question_type || '') === 'short_answer' ? (shortByQuestion[q.id] || '') : ''
      }
    })

    if (questionIds.length === 0) {
      const { data: lessons2 } = lessonIdsFromAttempts.length ? await svc.from('lessons').select('id,title,grade_id').in('id', lessonIdsFromAttempts) : { data: [] }
      const gradeIds2 = Array.from(new Set((lessons2 || []).map((l: any) => l.grade_id).filter(Boolean)))
      const { data: grades2 } = gradeIds2.length ? await svc.from('grades').select('id,name').in('id', gradeIds2) : { data: [] }
      const titleByLesson2: Record<string, string> = Object.fromEntries((lessons2 || []).map((l: any) => [l.id, l.title || '']))
      const gradeByLesson2: Record<string, string> = Object.fromEntries((lessons2 || []).map((l: any) => [l.id, (grades2 || []).find((g: any) => g.id === l.grade_id)?.name || '']))
      let q2 = lessonIdsFromAttempts.length ? svc
        .from('questions')
        .select('id,content,question_type,correct_answer,choice_a,choice_b,choice_c,choice_d,explanation,difficulty,topic,lesson_id,created_at')
        .in('lesson_id', lessonIdsFromAttempts) : null
      if (q2) {
        if (typeFilter) q2 = q2.eq('question_type', typeFilter)
        if (difficultyFilter) q2 = q2.eq('difficulty', difficultyFilter)
      }
      const { data: qRows2 } = q2 ? await q2 : { data: [] as any[] }
      payload = (qRows2 || []).map((q: any) => {
        const lessonTitle = titleByLesson2[q.lesson_id] || ''
        const gradeName = gradeByLesson2[q.lesson_id] || ''
        const options = [
          { key: 'A', text: q.choice_a || '', is_correct: String(q.correct_answer || '').toUpperCase() === 'A', order: 1 },
          { key: 'B', text: q.choice_b || '', is_correct: String(q.correct_answer || '').toUpperCase() === 'B', order: 2 },
          { key: 'C', text: q.choice_c || '', is_correct: String(q.correct_answer || '').toUpperCase() === 'C', order: 3 },
          { key: 'D', text: q.choice_d || '', is_correct: String(q.correct_answer || '').toUpperCase() === 'D', order: 4 },
        ].filter(x => x.text)
        return {
          question_id: q.id,
          lesson_id: q.lesson_id || '',
          question_content: q.content || '',
          question_type: q.question_type || '',
          lesson_title: lessonTitle,
          grade_name: gradeName,
          total_attempts: 0,
          correct_rate: 0,
          question_created_at: q.created_at || null,
          difficulty: q.difficulty || '',
          topic: q.topic || '',
          options,
          explanation: q.explanation || '',
          correct_key: String(q.correct_answer || '').toUpperCase(),
          correct_text: String(q.question_type || '') === 'short_answer' ? '' : ''
        }
      })
    }

    if (gradeNameFilter) payload = payload.filter(p => (p.grade_name || '') === gradeNameFilter)
    if (lessonIdFilter) payload = payload.filter(p => (p.lesson_id || '') === lessonIdFilter)
    if (search) {
      const sLower = search.toLowerCase()
      payload = payload.filter(p => (p.question_content || '').toLowerCase().includes(sLower))
    }

    payload.sort((a, b) => {
      let diff = 0
      switch (sortKey) {
        case 'total_attempts':
          diff = (a.total_attempts || 0) - (b.total_attempts || 0); break
        case 'correct_rate':
          diff = (a.correct_rate || 0) - (b.correct_rate || 0); break
        case 'created_at':
          diff = (a.question_created_at ? Date.parse(a.question_created_at) : 0) - (b.question_created_at ? Date.parse(b.question_created_at) : 0); break
        case 'grade_name':
          diff = String(a.grade_name || '').localeCompare(String(b.grade_name || '')); break
        case 'lesson_title':
          diff = String(a.lesson_title || '').localeCompare(String(b.lesson_title || '')); break
      }
      return sortDir === 'asc' ? diff : -diff
    })

    const total = payload.length
    const start = (page - 1) * pageSize
    const paged = payload.slice(start, start + pageSize)

    return NextResponse.json({ questions: paged, total, page, page_size: pageSize, school_name: school?.name || '', debug: { students_count: userIds.length, attempts_count: attemptIds.length, answers_count: (answers || []).length, question_ids_count: questionIds.length } })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
