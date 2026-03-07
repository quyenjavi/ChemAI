'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type Q = {
  id: string,
  content: string,
  question_type: 'single_choice' | 'true_false' | 'short_answer',
  order_index: number,
  options: Array<{ key: string, text: string }>
}

export default function QuizClient({ lessonId, n }: { lessonId: string, n?: string }) {
  const desiredCount = Math.max(1, Math.min(30, Number(n || 0) || 0)) || null
  const [questions, setQuestions] = useState<Q[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [initError, setInitError] = useState('')
  const router = useRouter()

  useEffect(() => {
    if (!lessonId) return
    supabaseBrowser.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.push('/login')
      }
    })
    fetch(`/api/lessons/${lessonId}/questions`)
      .then(r => r.ok ? r.json() : [])
      .then((list: Q[]) => {
        const sliceN = desiredCount ? Math.min(desiredCount, list.length) : Math.min(20, list.length)
        setQuestions(list.slice(0, sliceN))
      })
    fetch('/api/attempts/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lessonId }),
      credentials: 'include',
    })
      .then(async r => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}))
          throw new Error(j.error || 'Không thể khởi tạo bài làm. Vui lòng đăng nhập lại.')
        }
        return r.json()
      })
      .then(json => setAttemptId(json.attemptId))
      .catch(err => setInitError(err.message || 'Lỗi khởi tạo bài'))
  }, [lessonId, desiredCount, router])

  const canSubmit = useMemo(() => {
    return !submitting && attemptId && questions.length > 0
  }, [submitting, attemptId, questions.length])

  async function onSubmit() {
    if (!attemptId) return
    setSubmitting(true)
    const payload = {
      attemptId,
      answers: questions.map(q => {
        if (q.question_type === 'short_answer') {
          return { questionId: q.id, answer_text: answers[q.id] || '' }
        }
        return { questionId: q.id, selected_answer: answers[q.id] || '' }
      })
    }
    const res = await fetch('/api/attempts/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    setSubmitting(false)
    if (!res.ok) {
      alert('Nộp bài thất bại')
      return
    }
    const j = await res.json()
    router.push(`/attempt/${j.attemptId}/result`)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Bài quiz</h1>
      <div className="text-sm" style={{color:'var(--text-muted)'}}>
        Số câu: {questions.length}
      </div>
      {initError ? <div className="text-sm text-red-600">{initError}</div> : null}
      <div className="space-y-6">
        {questions.map((q, idx) => (
          <Card key={q.id}>
            <CardHeader>
              <CardTitle>{idx+1}. {q.content}</CardTitle>
            </CardHeader>
            <CardContent>
            {q.question_type === 'short_answer' ? (
              <textarea
                className="w-full rounded border border-[var(--divider)] bg-[var(--bg)] text-[var(--text)] p-2"
                rows={4}
                value={answers[q.id] || ''}
                onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
                placeholder="Nhập câu trả lời của bạn..."
              />
            ) : (
              q.options.map(opt => (
                <label key={opt.key} className="flex items-center gap-2 py-1">
                  <input
                    type="radio"
                    name={`q-${q.id}`}
                    checked={(answers[q.id] || '') === opt.key}
                    onChange={() => setAnswers(a => ({ ...a, [q.id]: opt.key }))}
                  />
                  <span>{opt.key}. {opt.text}</span>
                </label>
              ))
            )}
            </CardContent>
          </Card>
        ))}
      </div>
      <Button
        disabled={!canSubmit}
        onClick={onSubmit}
        className="disabled:opacity-50"
      >
        {submitting ? 'Đang nộp...' : 'Nộp bài'}
      </Button>
    </div>
  )
}
