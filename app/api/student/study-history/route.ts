import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

type AttemptRow = {
  id: string
  lesson_id: string | null
  created_at: string | null
  total_questions: number | null
  correct_answers: number | null
  score_percent: number | null
  lessons?: { title?: string | null } | null
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function normalizeString(v: any): string {
  return String(v ?? '').trim()
}

export async function GET() {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const svc = serviceRoleClient()
    const { data: profile } = await svc
      .from('student_profiles')
      .select('grade_id')
      .eq('user_id', user.id)
      .maybeSingle()
    const gradeId = profile?.grade_id ? String(profile.grade_id) : null

    const { data: attemptsRaw, error: attemptsErr } = await svc
      .from('quiz_attempts')
      .select('id, lesson_id, created_at, total_questions, correct_answers, score_percent, lessons(title)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(2000)

    if (attemptsErr) return NextResponse.json({ error: attemptsErr.message }, { status: 500 })

    const attempts = (attemptsRaw || []) as AttemptRow[]
    const attemptIds = attempts.map((a) => a.id).filter(Boolean)
    if (!attemptIds.length) {
      return NextResponse.json({ topic_stats: [], attempts: [] })
    }

    const hasReportByAttempt: Record<string, boolean> = {}
    const reviewedByAttempt: Record<string, boolean> = {}
    for (const id of attemptIds) {
      hasReportByAttempt[id] = false
      reviewedByAttempt[id] = false
    }

    const hasAdjustmentByAttempt: Record<string, boolean> = {}
    for (const id of attemptIds) hasAdjustmentByAttempt[id] = false

    const topicAgg: Record<string, { topic_unit: string, correct: number, wrong: number }> = {}

    for (const chunk of chunkArray(attemptIds, 200)) {
      const { data: reports } = await svc
        .from('question_reports')
        .select('attempt_id, reviewed_at')
        .in('attempt_id', chunk)
        .limit(50000)

      for (const r of (reports || []) as any[]) {
        const aid = String(r.attempt_id || '')
        if (!aid) continue
        hasReportByAttempt[aid] = true
        if (r.reviewed_at) reviewedByAttempt[aid] = true
      }

      const { data: adjustments } = await svc
        .from('quiz_attempt_answers')
        .select('attempt_id, review_adjustment_type')
        .in('attempt_id', chunk)
        .limit(100000)

      for (const r of (adjustments || []) as any[]) {
        const aid = String(r.attempt_id || '')
        if (!aid) continue
        const t = normalizeString(r.review_adjustment_type)
        if (t && t !== 'none') hasAdjustmentByAttempt[aid] = true
      }

      const { data: answerRows } = await svc
        .from('quiz_attempt_answers')
        .select('is_correct, question_id')
        .in('attempt_id', chunk)
        .limit(200000)

      const qIds = Array.from(new Set((answerRows || []).map((r: any) => String(r.question_id || '')).filter(Boolean)))
      const qMetaById: Record<string, { topic_unit: string | null, lesson_id: string | null }> = {}
      for (const qChunk of chunkArray(qIds, 500)) {
        const { data: qRows } = await svc
          .from('questions')
          .select('id, topic_unit, lesson_id')
          .in('id', qChunk)
          .limit(2000)
        for (const q of (qRows || []) as any[]) {
          const id = String(q.id || '')
          if (!id) continue
          qMetaById[id] = {
            topic_unit: normalizeString(q.topic_unit) || null,
            lesson_id: q.lesson_id ? String(q.lesson_id) : null
          }
        }
      }

      const lessonIds = Array.from(new Set(Object.values(qMetaById).map((m) => String(m.lesson_id || '')).filter(Boolean)))
      const lessonGradeById: Record<string, string> = {}
      for (const lChunk of chunkArray(lessonIds, 500)) {
        const { data: lessonRows } = await svc
          .from('lessons')
          .select('id, grade_id')
          .in('id', lChunk)
          .limit(2000)
        for (const l of (lessonRows || []) as any[]) {
          const id = String(l.id || '')
          const gid = l.grade_id ? String(l.grade_id) : ''
          if (!id || !gid) continue
          lessonGradeById[id] = gid
        }
      }

      for (const row of (answerRows || []) as any[]) {
        const ok = row.is_correct
        if (ok !== true && ok !== false) continue
        const qid = String(row.question_id || '')
        const meta = qMetaById[qid] || { topic_unit: null, lesson_id: null }
        const topicUnit = normalizeString(meta.topic_unit) || ''
        if (!topicUnit) continue
        if (gradeId) {
          const lessonId = normalizeString(meta.lesson_id)
          if (!lessonId) continue
          if (lessonGradeById[lessonId] !== gradeId) continue
        }
        const cur = topicAgg[topicUnit] || { topic_unit: topicUnit, correct: 0, wrong: 0 }
        if (ok === true) cur.correct += 1
        else cur.wrong += 1
        topicAgg[topicUnit] = cur
      }
    }

    const topic_stats = Object.values(topicAgg)
      .map((t) => {
        const total = t.correct + t.wrong
        const correct_percent = total ? Math.round((t.correct / total) * 100) : 0
        return { ...t, total, correct_percent }
      })
      .filter((t) => t.total > 0)
      .sort((a, b) => b.total - a.total)

    const attemptsOut = attempts.map((a) => {
      const total = Math.max(0, Number(a.total_questions) || 0)
      const correct = Math.max(0, Number(a.correct_answers) || 0)
      const percent = Number.isFinite(Number(a.score_percent)) ? Number(a.score_percent) : (total ? Math.round((correct / total) * 100) : 0)
      return {
        id: a.id,
        lesson_id: a.lesson_id || null,
        lesson_title: a.lessons?.title || '',
        created_at: a.created_at || null,
        total,
        correct,
        percent,
        has_report: !!hasReportByAttempt[a.id],
        reviewed: !!reviewedByAttempt[a.id],
        has_adjustment: !!hasAdjustmentByAttempt[a.id]
      }
    })

    return NextResponse.json({ topic_stats, attempts: attemptsOut })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
