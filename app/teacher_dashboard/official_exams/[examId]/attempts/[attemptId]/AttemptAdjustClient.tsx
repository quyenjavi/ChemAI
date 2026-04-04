'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

export default function AttemptAdjustClient({ examId, attemptId }: { examId: string, attemptId: string }) {
  const [attemptAnswerId, setAttemptAnswerId] = useState('')
  const [score, setScore] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')

  const submit = async () => {
    setLoading(true)
    setError('')
    setOkMsg('')
    const r = await fetch(`/api/teacher/official-exams/${examId}/attempts/${attemptId}/adjust-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        attempt_answer_id: attemptAnswerId,
        score_awarded: Number(score),
        note,
      }),
    })
    const j = await r.json().catch(() => ({}))
    setLoading(false)
    if (!r.ok) {
      setError(j.error || 'Adjust thất bại')
      return
    }
    setOkMsg('Đã cập nhật')
    window.location.reload()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review / Adjust (MVP)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <label className="text-sm">attempt_answer_id</label>
            <Input value={attemptAnswerId} onChange={e => setAttemptAnswerId(e.target.value)} placeholder="UUID của attempt_answer" />
          </div>
          <div>
            <label className="text-sm">score_awarded</label>
            <Input value={score} onChange={e => setScore(e.target.value)} placeholder="VD: 0.25" />
          </div>
        </div>
        <div>
          <label className="text-sm">Ghi chú</label>
          <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Lý do điều chỉnh..." />
        </div>
        {error ? <div className="text-red-500 text-sm">{error}</div> : null}
        {okMsg ? <div className="text-green-500 text-sm">{okMsg}</div> : null}
        <div className="flex items-center justify-end">
          <Button onClick={submit} disabled={loading || !attemptAnswerId.trim() || !score.trim()}>
            {loading ? 'Đang cập nhật...' : 'Apply'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

