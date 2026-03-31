'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type Diff = 'biet' | 'hieu' | 'van_dung' | 'van_dung_cao'

const DIFF_LABEL: Record<string, string> = {
  biet: 'Biết',
  hieu: 'Hiểu',
  van_dung: 'Vận dụng',
  van_dung_cao: 'Vận dụng cao'
}

function typeLabel(t: string | null) {
  if (t === 'single_choice') return 'Single choice'
  if (t === 'true_false_group') return 'True/False'
  if (t === 'short_answer') return 'Short answer'
  return t || '—'
}

function formatScore(v: any) {
  const n = Number(v || 0)
  if (!Number.isFinite(n)) return 0
  return Number(n.toFixed(2))
}

export default function MatrixExamDetailClient({ examId }: { examId: string }) {
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [dupLoading, setDupLoading] = useState(false)
  const [replaceLoadingIndex, setReplaceLoadingIndex] = useState<number | null>(null)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [exam, setExam] = useState<any>(null)
  const [items, setItems] = useState<any[]>([])
  const router = useRouter()

  const load = async (id: string) => {
    setLoading(true)
    setErr('')
    const r = await fetch(`/api/teacher/matrix-exams/${id}/preview`, { credentials: 'include' })
    const j = await r.json().catch(() => ({}))
    setLoading(false)
    if (!r.ok) { setErr(j.error || 'Không thể tải đề'); return }
    setExam(j.exam || null)
    setItems(Array.isArray(j.items) ? j.items : [])
  }

  useEffect(() => {
    load(examId)
  }, [examId])

  const publish = async () => {
    if (exam?.is_published) return
    const ok = window.confirm('Publish đề này? (Không xoá, lưu để tái sử dụng)')
    if (!ok) return
    setPublishing(true)
    setErr('')
    setMsg('')
    const r = await fetch(`/api/teacher/matrix-exams/${examId}/publish`, { method: 'POST', credentials: 'include' })
    const j = await r.json().catch(() => ({}))
    setPublishing(false)
    if (!r.ok) { setErr(j.error || 'Publish thất bại'); return }
    setMsg(`Đã publish thành công. Bài EXAM mới: ${j.lesson_id}`)
    await load(examId)
  }

  const duplicate = async () => {
    const nextTitle = window.prompt('Nhập tên đề mới', String(exam?.title ? `${exam.title} (copy)` : 'Đề ma trận (copy)'))
    if (nextTitle === null) return
    const title = String(nextTitle || '').trim()
    if (!title) { setErr('Vui lòng nhập tên đề'); return }
    setDupLoading(true)
    setErr('')
    const r = await fetch(`/api/teacher/matrix-exams/${examId}/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ title })
    })
    const j = await r.json().catch(() => ({}))
    setDupLoading(false)
    if (!r.ok) { setErr(j.error || 'Duplicate thất bại'); return }
    router.push(`/teacher_dashboard/matrix_exams/${j.exam_id}`)
  }

  const replaceQuestion = async (orderIndex: number) => {
    setReplaceLoadingIndex(orderIndex)
    setErr('')
    setMsg('')
    const r = await fetch(`/api/teacher/matrix-exams/${examId}/questions/${orderIndex}/replace`, { method: 'POST', credentials: 'include' })
    const j = await r.json().catch(() => ({}))
    setReplaceLoadingIndex(null)
    if (!r.ok) { setErr(j.error || 'Đổi câu thất bại'); return }
    await load(examId)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{exam?.title || 'Đề ma trận'}</h1>
          <div className="text-sm" style={{color:'var(--text-muted)'}}>
            Trạng thái: {exam?.is_published ? 'published' : 'draft'} · {Number(exam?.total_questions || 0)} câu · {formatScore(exam?.total_score)} điểm
          </div>
        </div>
        <Link href="/teacher_dashboard" className="underline" style={{color:'var(--gold)'}}>Quay lại</Link>
      </div>

      {err ? <div className="p-3 rounded border border-rose-500/30 bg-rose-500/10 text-rose-100">{err}</div> : null}
      {msg ? <div className="p-3 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-100 text-sm">{msg}</div> : null}

      <Card className="border" style={{borderColor:'var(--divider)'}}>
        <CardHeader><CardTitle>Hành động</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={publish} disabled={publishing || !!exam?.is_published}>
            {publishing ? 'Đang publish...' : 'Publish'}
          </Button>
          <Button variant="outline" onClick={duplicate} disabled={dupLoading}>
            {dupLoading ? 'Đang tạo...' : 'Duplicate (reuse matrix)'}
          </Button>
        </CardContent>
      </Card>

      <Card className="border" style={{borderColor:'var(--divider)'}}>
        <CardHeader><CardTitle>Cấu hình điểm</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-1">
          <div style={{color:'var(--text-muted)'}}>Điểm / câu:</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div className="rounded border p-3" style={{borderColor:'var(--divider)'}}>
              <div className="text-xs opacity-70">Single choice</div>
              <div className="font-semibold">{formatScore(exam?.scoring_config?.points_per_question?.single_choice)}</div>
            </div>
            <div className="rounded border p-3" style={{borderColor:'var(--divider)'}}>
              <div className="text-xs opacity-70">True/False</div>
              <div className="font-semibold">{formatScore(exam?.scoring_config?.points_per_question?.true_false)}</div>
            </div>
            <div className="rounded border p-3" style={{borderColor:'var(--divider)'}}>
              <div className="text-xs opacity-70">Short answer</div>
              <div className="font-semibold">{formatScore(exam?.scoring_config?.points_per_question?.short_answer)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border" style={{borderColor:'var(--divider)'}}>
        <CardHeader><CardTitle>Preview</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {loading ? <div>Đang tải...</div> : null}
          {items.map((it: any) => (
            <div key={it.question_id} className="rounded-md border border-slate-700/60 bg-slate-900/30 p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-semibold">
                  Câu {it.order_index} · {typeLabel(it.question_type)} ·{' '}
                  <span style={{color:'var(--gold)'}}>{it.lesson_title || '—'}</span>
                  {' '}· {it.topic_unit || '—'} ·{' '}
                  <span className="rounded px-2 py-0.5 border border-slate-700/60 bg-slate-950/20">
                    {DIFF_LABEL[String(it.difficulty_academic || '')] || it.difficulty_academic || '—'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => replaceQuestion(Number(it.order_index))}
                    disabled={replaceLoadingIndex === Number(it.order_index) || !!exam?.is_published}
                  >
                    {replaceLoadingIndex === Number(it.order_index) ? 'Đang đổi...' : 'Đổi câu'}
                  </Button>
                </div>
              </div>
              <div className="text-sm whitespace-pre-line" style={{color:'var(--text)'}}>{it.content}</div>
              {it.question_type === 'single_choice' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  {(it.options || []).slice().sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0)).map((o: any) => (
                    <div key={o.key} className={`rounded-md border p-3 ${o.is_correct ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-slate-700/60 bg-slate-950/20'}`}>
                      <div className="font-semibold">{o.key}. <span className="font-normal">{o.text}</span></div>
                    </div>
                  ))}
                  <div className="sm:col-span-2 text-sm">
                    <span className="opacity-70">Đáp án đúng:</span>{' '}
                    <span className="text-emerald-200 font-semibold">{(it.options || []).find((o: any) => o.is_correct)?.key || '—'}</span>
                  </div>
                </div>
              ) : null}
              {it.question_type === 'true_false_group' ? (
                <div className="space-y-2 text-sm">
                  {(it.statements || []).slice().sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0)).map((s: any) => (
                    <div key={s.id} className="rounded-md border border-slate-700/60 bg-slate-950/20 p-3 space-y-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="font-semibold">{s.key ? `${s.key}. ` : ''}<span className="font-normal">{s.text}</span></div>
                        <div className="text-xs opacity-80">{s.score}đ</div>
                      </div>
                      <div className="text-xs">
                        <span className="opacity-70">Đáp án đúng:</span>{' '}
                        <span className="text-emerald-200 font-semibold">{s.correct_answer ? 'Đúng' : 'Sai'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {it.question_type === 'short_answer' ? (
                <div className="rounded-md border border-slate-700/60 bg-slate-950/20 p-3 text-sm">
                  <div className="text-xs opacity-70">Đáp án tham khảo</div>
                  <ul className="list-disc pl-5 mt-1 space-y-1">
                    {(it.short_answers || []).map((a: any) => (
                      <li key={a.id}><span className="text-emerald-200 font-semibold">{a.answer_text}</span></li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {it.explanation ? (
                <div className="p-3 rounded-md border border-blue-500/30 bg-blue-500/10 text-blue-100 text-sm whitespace-pre-line">
                  <div className="font-semibold">Giải thích</div>
                  <div className="mt-1">{it.explanation}</div>
                </div>
              ) : null}
              {it.tip ? (
                <div className="p-3 rounded-md border border-yellow-500/30 bg-yellow-500/10 text-yellow-100 text-sm italic whitespace-pre-line">
                  <div className="not-italic font-semibold">Mẹo học nhanh</div>
                  <div className="mt-1">{it.tip}</div>
                </div>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
