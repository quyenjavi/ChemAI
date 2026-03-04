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
  const [seededThreadId, setSeededThreadId] = useState<string | null>(null)
  const [chatKey, setChatKey] = useState(0)

  useEffect(() => {
    if (!attemptId) return
    let mounted = true
    let tries = 0
    const load = async () => {
      const res = await fetch(`/api/attempts/${attemptId}/report`)
      if (!res.ok) return
      const j = await res.json()
      if (!mounted) return
      setAttempt(j.attempt)
      if (j.report?.feedback) {
        setFeedback(j.report.feedback)
        setLoadingReport(false)
        // Create thread immediately for faster chat mounting
        const tRes = await fetch('/api/chat/thread', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ attemptId })
        }).catch(()=>null)
        const tj = await tRes?.json().catch(()=>({})) as any
        if (tj?.threadId) setSeededThreadId(tj.threadId)
        // Seed in background; when done, bump key to refetch history
        fetch('/api/chat/seed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ attemptId })
        }).then(r => r.ok ? r.json() : null)
          .then(sj => {
            if (sj?.threadId && !seededThreadId) setSeededThreadId(sj.threadId)
            setChatKey(k => k + 1)
          })
      } else {
        tries += 1
        if (tries * 2000 >= 20000) {
          setLoadingReport(false)
        } else {
          setTimeout(load, 2000)
        }
      }
    }
    load()
    return () => { mounted = false }
  }, [attemptId])

  return (
    <div className="space-y-6">
      <h1 className="text-[32px] font-semibold">Kết quả</h1>
      {attempt ? (
        <Card>
          <CardContent className="py-4">
            <div className="text-2xl font-semibold">Điểm: {attempt.correct}/{attempt.total} ({attempt.score_percent}%)</div>
          </CardContent>
        </Card>
      ) : null}

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
                {feedback.mistakes.map((m,i)=>(
                  <li key={i} className="border rounded p-3" style={{borderColor:'var(--divider)'}}>
                    <div className="text-sm font-medium">{m.brief_question}</div>
                    <div className="text-xs mt-1">
                      <span style={{color:'#EF4444'}}>Bạn chọn: {m.chosen}</span>
                      <span style={{color:'var(--text-muted)'}}> — </span>
                      <span style={{color:'#22C55E'}}>Đúng: {m.correct}</span>
                    </div>
                    {m.explain ? <div className="text-sm mt-1">{m.explain}</div> : null}
                    {m.tip ? <div className="text-sm mt-1 italic" style={{color:'var(--warning)'}}>Mẹo: {m.tip}</div> : null}
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

      {/* Placeholder for chatbot container; UI & API wired below */}
      <Card>
        <CardHeader><CardTitle>Chat với Uyển Sensei</CardTitle></CardHeader>
        <CardContent>
        {seededThreadId ? (
          <ChatBox key={chatKey} attemptId={attemptId || ''} initialThreadId={seededThreadId} />
        ) : (
          <div className="text-sm" style={{color:'var(--text-muted)'}}>Đang khởi tạo hội thoại…</div>
        )}
        </CardContent>
      </Card>
      <div className="pt-2 flex justify-center">
        <Link href="/"><Button variant="outline">Trở về trang chủ</Button></Link>
      </div>
    </div>
  )
}

function ChatBox({ attemptId, initialThreadId }: { attemptId: string, initialThreadId?: string }) {
  const [threadId, setThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<{ role: 'user'|'assistant', content: string }[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!attemptId) return
    const establish = async () => {
      let tId = initialThreadId
      if (!tId) {
        const r = await fetch('/api/chat/thread', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ attemptId })
        })
        const j = await r.json()
        tId = j.threadId
      }
      setThreadId(tId || null)
      if (tId) {
        const res = await fetch(`/api/chat/history?threadId=${tId}`)
        if (res.ok) {
          const h = await res.json()
          setMessages(h.messages || [])
        }
      }
    }
    establish()
  }, [attemptId, initialThreadId])

  async function send() {
    if (!input || !threadId) return
    const text = input
    setInput('')
    setMessages(m => [...m, { role: 'user', content: text }])
    setSending(true)
    const res = await fetch('/api/chat/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId, content: text })
    })
    setSending(false)
    if (!res.ok) return
    const j = await res.json()
    setMessages(m => [...m, { role: 'assistant', content: j.reply || '' }])
  }

  return (
    <div className="chat-box">
      <div className="chat-hero">
        <div className="coach-avatar"><div className="galaxy-orb" /></div>
        <div className="hero-text">
          <div className="chat-hero-title">Uyển Sensei</div>
          <div className="chat-subtitle">Hỏi đáp Hóa THPT</div>
        </div>
      </div>
      <div className="chat-messages">
        {(messages.length > 2 ? messages.slice(2) : messages).map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}`}>
            <div className="bubble">{m.content}</div>
          </div>
        ))}
      </div>
      <div className="chat-input-row">
        <input className="input" value={input} onChange={e=>setInput(e.target.value)} placeholder="Nhập câu hỏi..." />
        <button className="button magic" onClick={send} disabled={sending || !input}>Gửi</button>
      </div>
    </div>
  )
}
