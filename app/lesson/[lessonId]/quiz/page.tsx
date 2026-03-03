'use client'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type Q = {
  id: string,
  content: string,
  choice_a: string, choice_b: string, choice_c: string, choice_d: string
}

export default function QuizPage() {
  const params = useParams()
  const lessonId = (params as any)?.lessonId as string | undefined
  const search = useSearchParams()
  const nParam = search?.get('n')
  const desiredCount = Math.max(1, Math.min(30, Number(nParam || 0) || 0)) || null
  const [questions, setQuestions] = useState<Q[]>([])
  const [answers, setAnswers] = useState<Record<string, 'A'|'B'|'C'|'D'>>({})
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
    supabaseBrowser
      .from('questions')
      .select('id, content, choice_a, choice_b, choice_c, choice_d')
      .eq('lesson_id', lessonId)
      .then(({ data }) => {
        const list = (data || []) as any as Q[]
        // shuffle
        for (let i = list.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[list[i], list[j]] = [list[j], list[i]]
        }
        const sliceN = desiredCount ? Math.min(desiredCount, list.length) : Math.min(20, list.length)
        setQuestions(list.slice(0, sliceN))
      })
    // create attempt
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
      answers: questions.map(q => ({
        questionId: q.id,
        chosenOption: answers[q.id] || ''
      }))
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
            {(['A','B','C','D'] as const).map(opt => {
              const text = opt === 'A' ? q.choice_a : opt === 'B' ? q.choice_b : opt === 'C' ? q.choice_c : q.choice_d
              return (
                <label key={opt} className="flex items-center gap-2 py-1">
                  <input
                    type="radio"
                    name={`q-${q.id}`}
                    checked={answers[q.id] === opt}
                    onChange={() => setAnswers(a => ({ ...a, [q.id]: opt }))}
                  />
                  <span>{opt}. {text}</span>
                </label>
              )
            })}
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
