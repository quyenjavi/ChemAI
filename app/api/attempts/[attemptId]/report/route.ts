import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export async function GET(_: Request, { params }: { params: { attemptId: string } }) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const svc = serviceRoleClient()
    const { data: attempt, error } = await svc
      .from('quiz_attempts')
      .select('id,user_id,lesson_id,mode,status,total_questions,correct_answers,score_percent,raw_score,total_score,accuracy_correct_units,accuracy_total_units,accuracy_percent,created_at')
      .eq('id', params.attemptId)
      .single()
    if (error || !attempt || attempt.user_id !== user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const { data: lesson } = attempt?.lesson_id
      ? await svc.from('lessons').select('title,lesson_type').eq('id', attempt.lesson_id).maybeSingle()
      : { data: null }
    const { data: report } = await svc
      .from('attempt_reports')
      .select('report_content')
      .eq('attempt_id', params.attemptId)
      .maybeSingle()
    const parseMaybeJson = (v: any) => {
      if (!v) return null
      if (typeof v === 'object') return v
      if (typeof v !== 'string') return null
      const s0 = v.trim()
      const s1 = s0
        .replace(/^```(?:json)?/i, '')
        .replace(/```$/i, '')
        .trim()
      const candidates = [s1, s0]
      for (const s of candidates) {
        try {
          return JSON.parse(s)
        } catch {}
        const start = s.indexOf('{')
        const end = s.lastIndexOf('}')
        if (start >= 0 && end > start) {
          const mid = s.slice(start, end + 1)
          try {
            return JSON.parse(mid)
          } catch {}
        }
      }
      return null
    }
    const raw = report?.report_content ? parseMaybeJson(report.report_content) : null
    const extracted =
      (parseMaybeJson(raw?.data?.outputs?.text) ||
        parseMaybeJson(raw?.outputs?.text) ||
        parseMaybeJson(raw?.data?.text) ||
        parseMaybeJson(raw?.text) ||
        raw?.data ||
        raw) ?? null

    const unwrap = (v: any) => (v && typeof v === 'object' && 'value' in v) ? v.value : v
    const unwrapArray = (v: any) => {
      const arr = unwrap(v)
      return Array.isArray(arr) ? arr : []
    }
    const short_answer_results =
      (Array.isArray(extracted?.short_answer_results) ? extracted.short_answer_results : null) ||
      (Array.isArray(extracted?.feedback?.short_answer_results) ? extracted.feedback.short_answer_results : null) ||
      []

    let f =
      extracted?.feedback?.feedback ||
      extracted?.outputs?.feedback?.feedback ||
      extracted?.data?.feedback?.feedback ||
      extracted?.data?.outputs?.feedback?.feedback ||
      extracted?.feedback ||
      extracted?.outputs?.feedback ||
      extracted?.data?.feedback ||
      extracted?.data?.outputs?.feedback ||
      raw?.outputs?.feedback ||
      raw?.feedback ||
      raw?.data?.feedback ||
      raw?.data?.outputs?.feedback ||
      null
    if (f && typeof f === 'object' && 'grading' in f && 'feedback' in f) f = (f as any).feedback

    const normalized = {
      feedback: {
        praise: (f ? (unwrap((f as any).praise) || '') : ''),
        strengths: (f ? unwrapArray((f as any).strengths) : []),
        plan: (f ? unwrapArray((f as any).plan) : [])
      },
      short_answer_results: Array.isArray(short_answer_results) ? short_answer_results : []
    }
    return NextResponse.json({
      attempt: {
        id: attempt.id,
        lesson_id: attempt.lesson_id,
        lesson_title: lesson?.title || '',
        lesson_type: (lesson?.lesson_type === 'exam' || lesson?.lesson_type === 'practice') ? lesson.lesson_type : attempt.mode,
        created_at: attempt.created_at || null,
        mode: attempt.mode,
        status: attempt.status,
        total_questions: attempt.total_questions,
        correct_answers: attempt.correct_answers,
        score_percent: attempt.score_percent,
        raw_score: attempt.raw_score,
        total_score: attempt.total_score,
        accuracy_correct_units: attempt.accuracy_correct_units,
        accuracy_total_units: attempt.accuracy_total_units,
        accuracy_percent: attempt.accuracy_percent
      },
      report: normalized,
      feedback: normalized.feedback,
      short_answer_results: normalized.short_answer_results
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
