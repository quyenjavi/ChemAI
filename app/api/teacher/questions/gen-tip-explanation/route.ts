import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase/server'
import { env } from '@/lib/env'

export const maxDuration = 300

async function callOpenAI(prompt: string) {
  const res = await fetch(`${env.openaiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.openaiApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: env.openaiModel,
      messages: [
        {
          role: 'system',
          content: 'Bạn là chuyên gia giáo dục Hóa học. Chỉ trả về một JSON duy nhất với các trường: tip, explanation.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3
    })
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenAI error: ${res.status} ${text}`)
  }
  const json = await res.json()
  const content = json?.choices?.[0]?.message?.content || ''
  return content
}

export async function POST(req: Request) {
  try {
    const payload = await req.json()
    const { 
      question_type, 
      content, 
      brief_content, 
      topic, 
      difficulty, 
      exam_score, 
      options, 
      statements, 
      short_answers 
    } = payload
    
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Check teacher profile
    const { data: teacher } = await supabase.from('teacher_profiles').select('id').eq('user_id', user.id).maybeSingle()
    if (!teacher) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let prompt = `Bạn là một chuyên gia giáo dục Hóa học. Hãy viết 'tip' (mẹo giải nhanh hoặc lưu ý quan trọng) và 'explanation' (lời giải chi tiết) cho câu hỏi sau đây.
    
Câu hỏi: ${content}
Loại câu hỏi: ${question_type}
${topic ? `Chủ đề: ${topic}` : ''}
${difficulty ? `Độ khó: ${difficulty}` : ''}
${exam_score ? `Điểm: ${exam_score}` : ''}
`

    if (question_type === 'single_choice') {
      prompt += `\nLựa chọn:\n${options.map((o: any) => `${o.option_key}. ${o.option_text}`).join('\n')}`
      const correct = options.find((o: any) => o.is_correct)
      if (correct) prompt += `\nĐáp án đúng: ${correct.option_key}`
    } else if (question_type === 'true_false_group' || question_type === 'true_false') {
      prompt += `\nMệnh đề:\n${statements.map((s: any) => `${s.statement_key || s.key}. ${s.statement_text || s.text} (${s.correct_answer ? 'Đúng' : 'Sai'})`).join('\n')}`
    } else if (question_type === 'short_answer') {
      prompt += `\nĐáp án chấp nhận: ${short_answers.map((sa: any) => sa.answer_text).join(' ; ')}`
    }

    prompt += `\n\nYêu cầu trả về định dạng JSON duy nhất như sau:
{
  "tip": "nội dung mẹo...",
  "explanation": "nội dung lời giải chi tiết..."
}`

    const reply = await callOpenAI(prompt)
    
    // Extract JSON from reply
    const jsonMatch = reply.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      try {
        const parsed = JSON.parse(reply.trim())
        return NextResponse.json(parsed)
      } catch {
      return NextResponse.json({ error: 'AI không trả về định dạng JSON hợp lệ', raw: reply }, { status: 500 })
      }
    }

    try {
      const result = JSON.parse(jsonMatch[0])
      return NextResponse.json(result)
    } catch {
      return NextResponse.json({ error: 'Lỗi parse JSON từ AI', raw: reply }, { status: 500 })
    }

  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
