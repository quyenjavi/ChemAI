import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'
import { env } from '@/lib/env'

export const maxDuration = 300

async function callDifyChat(body: any) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 300000)
  let res: Response
  try {
    res = await fetch(`${env.difyBaseUrl}/chat-messages`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${env.difyChatKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })
  } finally {
    clearTimeout(timeout)
  }
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Dify chat error: ${res.status} ${text}`)
  }
  return res.json()
}

function buildSeedMessage(attempt: any, feedback: any) {
  const lines: string[] = []
  lines.push(`Điểm: ${attempt.correct}/${attempt.total} (${attempt.score_percent}%)`)
  if (feedback?.praise) {
    lines.push(`Khen: ${feedback.praise}`)
  }
  if (Array.isArray(feedback?.strengths) && feedback.strengths.length) {
    lines.push('Điểm mạnh:')
    feedback.strengths.forEach((s: string) => lines.push(`- ${s}`))
  }
  if (Array.isArray(feedback?.mistakes) && feedback.mistakes.length) {
    lines.push('Các lỗi cần sửa:')
    feedback.mistakes.forEach((m: any, idx: number) => {
      lines.push(`${idx + 1}) ${m.brief_question}`)
      if (m.chosen) lines.push(`   Học sinh đã chọn: ${m.chosen}`)
      if (m.correct) lines.push(`   Đáp án đúng: ${m.correct}`)
      if (m.explain) lines.push(`   Giải thích: ${m.explain}`)
      if (m.tip) lines.push(`   Mẹo: ${m.tip}`)
    })
  }
  if (Array.isArray(feedback?.plan) && feedback.plan.length) {
    lines.push('Kế hoạch ôn tập:')
    feedback.plan.forEach((p: string) => lines.push(`- ${p}`))
  }
  return `Xin chào, đây là kết quả bài kiểm tra của tôi:\n\n${lines.join('\n')}\n\nHãy phân tích và gợi ý lộ trình học tập phù hợp.`
}

export async function POST(request: Request) {
  try {
    const { attemptId } = await request.json()
    if (!attemptId) return NextResponse.json({ error: 'attemptId required' }, { status: 400 })
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const svc = serviceRoleClient()
    // verify attempt and get stats
    const { data: attempt } = await svc.from('quiz_attempts')
      .select('id,user_id,total_questions,correct_answers,score_percent')
      .eq('id', attemptId).single()
    if (!attempt || attempt.user_id !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    // load feedback
    const { data: report } = await svc.from('attempt_reports')
      .select('report_content')
      .eq('attempt_id', attemptId)
      .maybeSingle()
    const fb = report?.report_content ? (JSON.parse(report.report_content)?.feedback || null) : null
    // reset old threads/messages for this attempt
    const { data: threads } = await svc.from('chat_threads')
      .select('id').eq('attempt_id', attemptId).eq('user_id', user.id)
    const threadIds = (threads || []).map(t => t.id)
    if (threadIds.length) {
      await svc.from('chat_messages').delete().in('thread_id', threadIds as any)
      await svc.from('chat_threads').delete().in('id', threadIds as any)
    }
    // create new thread
    const { data: created, error: cErr } = await svc.from('chat_threads')
      .insert({ attempt_id: attemptId, user_id: user.id })
      .select('id')
      .single()
    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 400 })
    const threadId = created.id as string
    if (fb) {
      const seed = buildSeedMessage({
        total: attempt.total_questions,
        correct: attempt.correct_answers,
        score_percent: attempt.score_percent
      }, fb)
      // save user seed message
      await svc.from('chat_messages').insert({ thread_id: threadId, role: 'user', content: seed })
      // call dify with conversation_id = new thread id
      const difyRes = await callDifyChat({
        inputs: {},
        query: seed,
        response_mode: 'blocking',
        user: user.id,
        conversation_id: ''
      })
      const reply = difyRes?.answer || difyRes?.data?.answer || ''
      if (reply) {
        await svc.from('chat_messages').insert({ thread_id: threadId, role: 'assistant', content: reply })
      }
    }
    return NextResponse.json({ threadId })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
