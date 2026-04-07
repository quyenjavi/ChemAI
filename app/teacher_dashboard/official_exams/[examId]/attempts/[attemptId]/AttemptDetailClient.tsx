'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function AttemptDetailClient({ examId, attemptId }: { examId: string, attemptId: string }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState<any | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/teacher/official-exams/${examId}/attempts/${attemptId}`, { credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Không thể tải bài làm')
      setData(json)
    } catch (e: any) {
      setError(e.message || 'Có lỗi xảy ra')
    } finally {
      setLoading(false)
    }
  }, [attemptId, examId])

  useEffect(() => {
    load()
  }, [load])

  const student = data?.student
  const paper = data?.paper
  const sheet = data?.sheet
  const attempt = data?.attempt
  const questions = Array.isArray(data?.questions) ? data.questions : []

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="text-2xl font-semibold whitespace-normal break-words">Chi tiết bài làm</div>
          <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {student ? (
              <>
                {student.student_code} · {student.full_name} · {student.class_name}
              </>
            ) : null}
            {paper?.paper_code ? <> · Mã đề {paper.paper_code}</> : null}
          </div>
        </div>
        <Link href={`/teacher_dashboard/official_exams/${examId}#scores`} prefetch={false} className="underline">← Bảng điểm</Link>
      </div>

      {loading ? <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Đang tải…</div> : null}
      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      {attempt ? (
        <Card>
          <CardHeader>
            <CardTitle>Tổng quan</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            <div>Điểm: <b>{attempt.raw_score}/{attempt.total_score}</b></div>
            <div>Đúng: <b>{attempt.correct_count}</b></div>
            <div>Sai: <b>{attempt.wrong_count}</b></div>
            <div>Trống: <b>{attempt.blank_count}</b></div>
          </CardContent>
        </Card>
      ) : null}

      {sheet?.signed_url ? (
        <Card>
          <CardHeader>
            <CardTitle>Ảnh bài làm</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <img src={sheet.signed_url} alt="Ảnh bài làm" className="w-full max-h-[70vh] object-contain rounded border" style={{ borderColor: 'var(--divider)' }} />
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Trạng thái xử lý: {sheet.process_status}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Kết quả theo câu</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {questions.map((q: any) => (
            <div key={q.question_id} className="border rounded p-4 space-y-2" style={{ borderColor: 'var(--divider)' }}>
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-semibold">Câu {q.no}</div>
                <div className={q.is_correct ? 'text-emerald-300 text-xs font-semibold' : 'text-rose-300 text-xs font-semibold'}>
                  {q.is_correct ? 'Đúng' : 'Sai'}
                </div>
              </div>
              <div className="text-sm whitespace-pre-wrap">{q.content}</div>
              {q.image_url ? (
                <div className="space-y-2">
                  <img src={q.image_url} alt={q.image_alt || 'Hình minh hoạ'} className="w-full max-h-72 object-contain rounded border" style={{ borderColor: 'var(--divider)' }} />
                  {q.image_caption ? <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{q.image_caption}</div> : null}
                </div>
              ) : null}
              {Array.isArray(q.options) && q.options.length ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  {q.options.map((o: any) => {
                    const picked = q.student_choice && String(q.student_choice).toUpperCase() === String(o.key).toUpperCase()
                    const correct = o.is_correct === true
                    const cls = correct ? 'border-emerald-500/30 bg-emerald-500/10' : picked ? 'border-rose-500/30 bg-rose-500/10' : 'border-slate-700/60 bg-slate-900/20'
                    return (
                      <div key={o.key} className={`rounded-md border p-3 ${cls}`}>
                        <div className="font-semibold">
                          {o.key}. <span className="font-normal">{o.text}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : null}
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Bạn chọn: <span style={{ color: 'var(--text)' }}>{q.student_choice || '—'}</span>
                {' '}· Đáp án đúng: <span style={{ color: 'var(--text)' }}>{q.correct_choice || '—'}</span>
                {' '}· Điểm: <span style={{ color: 'var(--text)' }}>{q.score_awarded}/{q.max_score}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

