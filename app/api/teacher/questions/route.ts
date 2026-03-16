import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10))
    const pageSize = Math.max(1, parseInt(url.searchParams.get('page_size') || '20', 10))
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
    // Build base query from questions
    let qQuery = svc.from('questions').select('id,content,question_type,explanation,difficulty,topic,lesson_id,created_at')
    if (typeFilter) qQuery = qQuery.eq('question_type', typeFilter)
    if (difficultyFilter) qQuery = qQuery.eq('difficulty', difficultyFilter)
    if (lessonIdFilter) qQuery = qQuery.eq('lesson_id', lessonIdFilter)
    const { data: qRows } = await qQuery
    const questionIds = Array.from(new Set((qRows || []).map((q: any) => q.id)))
    // Resolve lessons/grades metadata
    const lessonIds = Array.from(new Set((qRows || []).map((q: any) => q.lesson_id).filter(Boolean)))
    const { data: lessons } = lessonIds.length ? await svc.from('lessons').select('id,title,grade_id').in('id', lessonIds) : { data: [] }
    const gradeIds = Array.from(new Set((lessons || []).map((l: any) => l.grade_id).filter(Boolean)))
    const { data: grades } = gradeIds.length ? await svc.from('grades').select('id,name').in('id', gradeIds) : { data: [] }
    const titleByLesson: Record<string, string> = Object.fromEntries((lessons || []).map((l: any) => [l.id, l.title || '']))
    const gradeByLesson: Record<string, string> = Object.fromEntries((lessons || []).map((l: any) => [l.id, (grades || []).find((g: any) => g.id === l.grade_id)?.name || '']))
    // Fetch answers for these questions (left-join semantics handled in code)
    const { data: answersAll } = questionIds.length ? await svc.from('quiz_attempt_answers').select('id,question_id,is_correct,attempt_id').in('question_id', questionIds) : { data: [] }
    // Fetch attempts to map answer -> user, then filter by teacher school
    const attemptIdsForAnswers = Array.from(new Set((answersAll || []).map((a: any) => a.attempt_id).filter(Boolean)))
    const { data: attemptsMapRows } = attemptIdsForAnswers.length ? await svc.from('quiz_attempts').select('id,user_id').in('id', attemptIdsForAnswers) : { data: [] }
    const attemptUserById: Record<string, string> = Object.fromEntries((attemptsMapRows || []).map((a: any) => [a.id, a.user_id]))
    const userIdsFromAnswers = Array.from(new Set((attemptsMapRows || []).map((a: any) => a.user_id).filter(Boolean)))
    const { data: studentsFromAnswers } = userIdsFromAnswers.length ? await svc.from('student_profiles').select('user_id,school_id').in('user_id', userIdsFromAnswers) : { data: [] }
    const allowedUsersSet = new Set<string>((studentsFromAnswers || []).filter((s: any) => !tp?.school_id || s.school_id === tp.school_id).map((s: any) => s.user_id))
    const answersFiltered = (answersAll || [])
    // Aggregate counts
    const byQuestion: Record<string, { total: number, correct: number }> = {}
    for (const r of (answersFiltered || []) as any[]) {
      const qid = r.question_id
      if (!qid) continue
      const st = byQuestion[qid] || { total: 0, correct: 0 }
      st.total += 1
      if (r.is_correct === true) st.correct += 1
      byQuestion[qid] = st
    }

    // Optional grade filter applied on payload after aggregation

    const { data: qOpts } = await svc.from('question_options').select('question_id,option_key,option_text,is_correct,sort_order').in('question_id', (qRows || []).map((x: any) => x.id)).order('sort_order', { ascending: true })
    const optsByQuestion: Record<string, any[]> = {}
    for (const o of (qOpts || []) as any[]) {
      const arr = optsByQuestion[o.question_id] || []
      arr.push({ key: o.option_key, text: o.option_text, is_correct: !!o.is_correct, order: o.sort_order ?? 0 })
      optsByQuestion[o.question_id] = arr
    }
    const shortIds = (qRows || []).filter((q: any) => String(q.question_type || '') === 'short_answer').map((q: any) => q.id)
    const { data: shortRows } = shortIds.length ? await svc.from('question_short_answers').select('question_id,answer_text').in('question_id', shortIds) : { data: [] }
    const acceptedByQuestion: Record<string, string[]> = {}
    for (const s of (shortRows || []) as any[]) {
      const arr = acceptedByQuestion[s.question_id] || []
      if (s.answer_text) arr.push(s.answer_text)
      acceptedByQuestion[s.question_id] = arr
    }

    let payload = (qRows || []).map((q: any) => {
      const st = byQuestion[q.id] || { total: 0, correct: 0 }
      const rate = st.total ? Math.round((100 * st.correct / st.total) * 100) / 100 : 0
      const lessonTitle = titleByLesson[q.lesson_id] || ''
      const gradeName = gradeByLesson[q.lesson_id] || ''
      const options = optsByQuestion[q.id] || []
      const correctKey = (options.find(o => o.is_correct) || { key: '' }).key
      const accepted_answers = acceptedByQuestion[q.id] || []
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
        correct_key: correctKey,
        accepted_answers
      }
    })

    // No fallback branch: always start from questions, unanswered remain with counts = 0

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
    return NextResponse.json(
      { questions: paged, total, page, page_size: pageSize, scope: 'all' },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    )
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
