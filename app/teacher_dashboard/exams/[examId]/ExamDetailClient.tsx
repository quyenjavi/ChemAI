'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type PreviewItem = {
  exam_question_id: string
  question_order: number
  points: number
  question_id: string
  source_type?: string | null
  source_question_id?: string | null
  question_type: string | null
  lesson_title: string | null
  lesson_id: string | null
  topic_unit?: string | null
  difficulty_academic?: string | null
  difficulty: string | null
  content: string
  tip?: string
  explanation?: string
  options?: Array<{ key: string, text: string, is_correct: boolean, order: number }>
  statements?: Array<{ id: string, key: string, text: string, correct_answer: boolean, score: number, order: number, explanation: string, tip: string }>
  short_answers?: Array<{ id: string, answer_text: string, score: number, explanation: string, tip: string }>
}

const DIFF_LABEL: Record<string, string> = {
  biet: 'Biết',
  hieu: 'Hiểu',
  van_dung: 'Vận dụng',
  van_dung_cao: 'Vận dụng cao'
}

function previewTypeLabel(t: string | null) {
  if (t === 'single_choice') return 'Single Choice'
  if (t === 'true_false' || t === 'true_false_group') return 'True / False'
  if (t === 'short_answer') return 'Short Answer'
  return t || '—'
}

export default function ExamDetailClient({ examId }: { examId: string }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [dupLoading, setDupLoading] = useState(false)
  const [err, setErr] = useState('')
  const [savedMsg, setSavedMsg] = useState('')
  const [exam, setExam] = useState<any>(null)
  const [items, setItems] = useState<PreviewItem[]>([])
  const [replaceLoadingId, setReplaceLoadingId] = useState<string | null>(null)
  const [aiLoadingId, setAiLoadingId] = useState<string | null>(null)
  const router = useRouter()

  const load = async (id: string) => {
    setLoading(true)
    setErr('')
    const r = await fetch(`/api/teacher/exams/${id}/preview`, { credentials: 'include' })
    const j = await r.json().catch(() => ({}))
    setLoading(false)
    if (!r.ok) { setErr(j.error || 'Không thể tải đề'); return }
    setExam(j.exam || null)
    setItems(Array.isArray(j.items) ? j.items : [])
  }

  useEffect(() => {
    load(examId)
  }, [examId])

  const saveExam = async () => {
    setSaving(true)
    setErr('')
    setSavedMsg('')
    const r = await fetch(`/api/teacher/exams/${examId}/save`, { method: 'POST', credentials: 'include' })
    const j = await r.json().catch(() => ({}))
    setSaving(false)
    if (!r.ok) { setErr(j.error || 'Lưu đề thất bại'); return }
    setSavedMsg('Đã lưu đề. Trạng thái: saved. Chưa publish cho học sinh.')
    await load(examId)
  }

  const publishExam = async () => {
    if (exam?.status === 'published') return
    const ok = window.confirm('Publish đề này để tạo bài EXAM cho học sinh? (Sau publish có thể ẩn/hiện bằng lessons.is_visible)')
    if (!ok) return
    setPublishing(true)
    setErr('')
    setSavedMsg('')
    const r = await fetch(`/api/teacher/exams/${examId}/publish`, { method: 'POST', credentials: 'include' })
    const j = await r.json().catch(() => ({}))
    setPublishing(false)
    if (!r.ok) { setErr(j.error || 'Publish thất bại'); return }
    setSavedMsg(`Đã publish thành công. Lesson mới: ${j.lesson_id}`)
    await load(examId)
  }

  const duplicateAi = async () => {
    const ok = window.confirm(
      'Tạo phiên bản mới từ đề này:\n- Giữ nguyên cấu trúc đề\n- Giữ nguyên số lượng câu và điểm\n- Ưu tiên chọn câu khác từ ngân hàng\n- Sử dụng AI để tạo biến thể khi cần\n- Giáo viên sẽ duyệt lại trước khi lưu'
    )
    if (!ok) return
    setDupLoading(true)
    setErr('')
    const r = await fetch(`/api/teacher/exams/${examId}/ai-duplicate`, { method: 'POST', credentials: 'include' })
    const j = await r.json().catch(() => ({}))
    setDupLoading(false)
    if (!r.ok) { setErr(j.error || 'AI Duplicate thất bại'); return }
    const newId = j.exam_id as string
    router.push(`/teacher_dashboard/exams/${newId}`)
  }

  const replaceQuestion = async (examQuestionId: string) => {
    setReplaceLoadingId(examQuestionId)
    setErr('')
    const r = await fetch(`/api/teacher/exams/${examId}/questions/${examQuestionId}/replace`, { method: 'POST', credentials: 'include' })
    const j = await r.json().catch(() => ({}))
    setReplaceLoadingId(null)
    if (!r.ok) { setErr(j.error || 'Đổi câu thất bại'); return }
    await load(examId)
  }

  const regenerateAi = async (examQuestionId: string) => {
    setAiLoadingId(examQuestionId)
    setErr('')
    const r = await fetch(`/api/teacher/exams/${examId}/questions/${examQuestionId}/ai-regenerate`, { method: 'POST', credentials: 'include' })
    const j = await r.json().catch(() => ({}))
    setAiLoadingId(null)
    if (!r.ok) { setErr(j.error || 'AI tạo lại thất bại'); return }
    await load(examId)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{exam?.title || 'Chi tiết đề'}</h1>
          {exam?.description ? <div className="text-sm" style={{color:'var(--text-muted)'}}>{exam.description}</div> : null}
          {exam?.status ? <div className="text-sm" style={{color:'var(--text-muted)'}}>Trạng thái: {exam.status}</div> : null}
        </div>
        <div className="flex items-center gap-2">
          <Link href="/teacher_dashboard" className="underline" style={{color:'var(--gold)'}}>Quay lại</Link>
        </div>
      </div>

      {err ? <div className="p-3 rounded border border-rose-500/30 bg-rose-500/10 text-rose-100">{err}</div> : null}
      {savedMsg ? <div className="p-3 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-100 text-sm">{savedMsg}</div> : null}

      <Card className="border" style={{borderColor:'var(--divider)'}}>
        <CardHeader><CardTitle>Hành động</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={saveExam} disabled={saving || exam?.status === 'published'}>{saving ? 'Đang lưu...' : 'Lưu đề'}</Button>
          <Button variant="outline" onClick={publishExam} disabled={publishing || exam?.status !== 'saved'}>{publishing ? 'Đang publish...' : 'Publish'}</Button>
          <Button variant="outline" onClick={duplicateAi} disabled={dupLoading}>{dupLoading ? 'Đang tạo...' : 'AI Duplicate đề'}</Button>
        </CardContent>
      </Card>

      <Card className="border" style={{borderColor:'var(--divider)'}}>
        <CardHeader><CardTitle>Preview</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {loading ? <div>Đang tải...</div> : null}
          {items.map(it => (
            <div key={it.exam_question_id} className="rounded-md border border-slate-700/60 bg-slate-900/30 p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-semibold">
                    Câu {it.question_order} · {previewTypeLabel(it.question_type)} · {it.lesson_title || it.lesson_id} · {it.topic_unit || '—'} · {DIFF_LABEL[String(it.difficulty_academic || '')] || it.difficulty_academic || it.difficulty || '—'} · {it.points}đ
                  {it.source_type ? <span className="ml-2 text-xs opacity-70">[{it.source_type === 'ai_variant' ? 'AI' : 'Bank'}]</span> : null}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => replaceQuestion(it.exam_question_id)} disabled={replaceLoadingId === it.exam_question_id}>
                    {replaceLoadingId === it.exam_question_id ? 'Đang đổi...' : 'Đổi câu khác'}
                  </Button>
                  <Button variant="outline" onClick={() => regenerateAi(it.exam_question_id)} disabled={aiLoadingId === it.exam_question_id}>
                    {aiLoadingId === it.exam_question_id ? 'Đang tạo...' : 'AI tạo lại câu'}
                  </Button>
                </div>
              </div>
              <div className="text-sm whitespace-pre-line" style={{color:'var(--text)'}}>{it.content}</div>

              {it.question_type === 'single_choice' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  {(it.options || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(o => (
                    <div key={o.key} className={`rounded-md border p-3 ${o.is_correct ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-slate-700/60 bg-slate-950/20'}`}>
                      <div className="font-semibold">{o.key}. <span className="font-normal">{o.text}</span></div>
                    </div>
                  ))}
                  <div className="sm:col-span-2 text-sm">
                    <span className="opacity-70">Đáp án đúng:</span>{' '}
                    <span className="text-emerald-200 font-semibold">
                      {(it.options || []).find(o => o.is_correct)?.key || '—'}
                    </span>
                  </div>
                </div>
              ) : null}

              {it.question_type === 'true_false_group' ? (
                <div className="space-y-2 text-sm">
                  {(it.statements || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(s => (
                    <div key={s.id} className="rounded-md border border-slate-700/60 bg-slate-950/20 p-3 space-y-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="font-semibold">{s.key ? `${s.key}. ` : ''}<span className="font-normal">{s.text}</span></div>
                        <div className="text-xs opacity-80">{s.score}đ</div>
                      </div>
                      <div className="text-xs">
                        <span className="opacity-70">Đáp án đúng:</span>{' '}
                        <span className="text-emerald-200 font-semibold">{s.correct_answer ? 'Đúng' : 'Sai'}</span>
                      </div>
                      {s.explanation ? (
                        <div className="p-3 rounded-md border border-blue-500/30 bg-blue-500/10 text-blue-100 text-sm whitespace-pre-line">
                          <div className="font-semibold">Giải thích</div>
                          <div className="mt-1">{s.explanation}</div>
                        </div>
                      ) : null}
                      {s.tip ? (
                        <div className="p-3 rounded-md border border-yellow-500/30 bg-yellow-500/10 text-yellow-100 text-sm italic whitespace-pre-line">
                          <div className="not-italic font-semibold">Mẹo học nhanh</div>
                          <div className="mt-1">{s.tip}</div>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}

              {it.question_type === 'short_answer' ? (
                <div className="space-y-2 text-sm">
                  <div className="rounded-md border border-slate-700/60 bg-slate-950/20 p-3">
                    <div className="text-xs opacity-70">Đáp án tham khảo</div>
                    <ul className="list-disc pl-5 mt-1 space-y-1">
                      {(it.short_answers || []).map(a => (
                        <li key={a.id}><span className="text-emerald-200 font-semibold">{a.answer_text}</span> <span className="opacity-70">({a.score}đ)</span></li>
                      ))}
                    </ul>
                  </div>
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
