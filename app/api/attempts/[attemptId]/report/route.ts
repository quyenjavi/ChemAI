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
      .select('id,user_id,total_questions,correct_answers,score_percent')
      .eq('id', params.attemptId)
      .single()
    if (error || !attempt || attempt.user_id !== user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const { data: report } = await svc
      .from('attempt_reports')
      .select('report_content')
      .eq('attempt_id', params.attemptId)
      .maybeSingle()
    const raw = report?.report_content ? JSON.parse(report.report_content) : null
    let normalized: any = null
    if (raw && raw.outputs && raw.outputs.feedback) {
      const f = raw.outputs.feedback
      const unwrap = (v: any) => (v && typeof v === 'object' && 'value' in v) ? v.value : v
      const unwrapArray = (v: any) => {
        const arr = unwrap(v)
        return Array.isArray(arr) ? arr : []
      }
      const mistakesArr = unwrapArray(f.mistakes).map((m: any) => ({
        brief_question: unwrap(m?.brief_question) || '',
        chosen: unwrap(m?.chosen) || '',
        correct: unwrap(m?.correct) || '',
        explain: unwrap(m?.explain) || '',
        tip: unwrap(m?.tip) || ''
      }))
      normalized = {
        feedback: {
          praise: unwrap(f.praise) || '',
          strengths: unwrapArray(f.strengths),
          mistakes: mistakesArr,
          plan: unwrapArray(f.plan)
        },
        final_correct: unwrap(f.final_correct) ?? null,
        final_total: unwrap(f.final_total) ?? null,
        final_accuracy: unwrap(f.final_accuracy) ?? null
      }
    } else {
      normalized = raw
    }
    return NextResponse.json({
      attempt: {
        id: attempt.id,
        total: attempt.total_questions,
        correct: attempt.correct_answers,
        score_percent: attempt.score_percent
      },
      report: normalized
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
