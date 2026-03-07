'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type AttemptInfo = { id: string, total: number, correct: number, score_percent: number }
type Feedback = {
  praise: string,
  strengths: string[],
  mistakes: { brief_question: string, chosen: string, correct: string, explain: string, tip: string }[],
  plan: string[],
}

export default function ResultPage() {
  const params = useParams()
  const attemptId = (params as any)?.attemptId as string | undefined
  const [attempt, setAttempt] = useState<AttemptInfo | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [loadingReport, setLoadingReport] = useState(true)
  // Chatbot tạm ngừng hoạt động
  const [answers, setAnswers] = useState<Array<{ question_id: string, content: string, question_type: string, selected_answer: string | null, selected_text?: string | null, answer_text: string | null, correct_key: string | null, correct_text?: string | null, ai_score: number | null, ai_feedback: string | null }>>([])
  const [finalCorrect, setFinalCorrect] = useState<number | null>(null)
  const [finalTotal, setFinalTotal] = useState<number | null>(null)
  const [finalAccuracy, setFinalAccuracy] = useState<number | null>(null)
  const [mistakes, setMistakes] = useState<Array<{ question_id: string|null, brief_question: string, chosen_answer: string, correct_answer: string, explanation: string, tip: string }>>([])

  useEffect(() => {
    if (!attemptId) return
    ;(async () => {
      const res = await fetch(`/api/attempts/${attemptId}/report`)
      if (res.ok) {
        const j = await res.json()
        setAttempt(j.attempt)
        if (j.report) {
          const toNum = (v: any) => {
            const n = typeof v === 'string' ? parseFloat(String(v).replace('%','').trim()) : Number(v)
            return Number.isFinite(n) ? n : 0
          }
          if (j.report.final_correct != null) setFinalCorrect(toNum(j.report.final_correct))
          if (j.report.final_total != null) setFinalTotal(toNum(j.report.final_total))
          if (j.report.final_accuracy != null) setFinalAccuracy(toNum(j.report.final_accuracy))
          if (j.report.feedback) {
            setFeedback(j.report.feedback)
          }
        }
      }
      setLoadingReport(false)
    })()
    fetch(`/api/attempts/${attemptId}/answers`).then(r => r.ok ? r.json() : null).then(j => {
      if (j?.answers) setAnswers(j.answers)
    })
    fetch(`/api/attempts/${attemptId}/mistakes`).then(r => r.ok ? r.json() : null).then(j => {
      if (j?.mistakes) setMistakes(j.mistakes)
    })
  }, [attemptId])
 
  return (
    <div className="space-y-6">
      <h1 className="text-[32px] font-semibold">Kết quả</h1>
      {finalCorrect != null && finalTotal != null && finalAccuracy != null ? (
        <Card>
          <CardContent className="py-4">
            <div className="text-2xl font-semibold">Đúng: {finalCorrect}/{finalTotal} — Tỷ lệ đúng: {finalAccuracy}%</div>
          </CardContent>
        </Card>
      ) : null}

      {null}

      {loadingReport ? (
        <div className="text-slate-600">Uyển Sensei đang viết nhận xét…</div>
      ) : feedback ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle>Nhận xét chung</CardTitle></CardHeader>
            <CardContent><p className="whitespace-pre-line" style={{color:'var(--text)'}}>{feedback.praise}</p></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Điểm mạnh</CardTitle></CardHeader>
            <CardContent>
              <ul className="list-disc pl-5" style={{color:'var(--text)'}}>
                {feedback.strengths.map((s,i)=><li key={i}>{s}</li>)}
              </ul>
            </CardContent>
          </Card>
          <Card className="md:col-span-2">
            <CardHeader><CardTitle>Các lỗi cần sửa</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {(mistakes.length ? mistakes : (feedback.mistakes || [])).map((m:any,i:number)=>(
                  <li key={i} className="border rounded p-3" style={{borderColor:'var(--divider)'}}>
                    <div className="text-sm font-medium">{m.brief_question}</div>
                    <div className="text-xs mt-1">
                      <span style={{color:'#EF4444'}}>Bạn trả lời: {m.chosen || m.chosen_answer}</span>
                      <span style={{color:'var(--text-muted)'}}> — </span>
                      <span style={{color:'#22C55E'}}>Đáp án: {m.correct || m.correct_answer}</span>
                    </div>
                    {(m.explain || m.explanation) ? <div className="text-sm mt-1">{m.explain || m.explanation}</div> : null}
                    {(m.tip) ? <div className="text-sm mt-1 italic" style={{color:'var(--warning)'}}>Mẹo: {m.tip}</div> : null}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card className="md:col-span-2">
            <CardHeader><CardTitle>Kế hoạch ôn tập</CardTitle></CardHeader>
            <CardContent>
              <ul className="list-disc pl-5" style={{color:'var(--text)'}}>
                {feedback.plan.map((p,i)=><li key={i}>{p}</li>)}
              </ul>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="text-slate-600">Chưa có nhận xét.</div>
      )}

      <Card>
        <CardHeader><CardTitle>Chatbot Uyển Sensei</CardTitle></CardHeader>
        <CardContent>
          <div className="text-sm" style={{color:'var(--text-muted)'}}>
            Chức năng chat đang được nâng cấp và sẽ trở lại sớm.
          </div>
        </CardContent>
      </Card>
      <div className="pt-2 flex justify-center">
        <Link href="/"><Button variant="outline">Trở về trang chủ</Button></Link>
      </div>
    </div>
  )
}

// ChatBox tạm dừng trong giai đoạn nâng cấp
