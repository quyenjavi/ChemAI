'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { supabaseBrowser } from '@/lib/supabase/client'

type LessonDetail = {
  id: string
  title: string
  description: string | null
  grade_id: string | null
  grade_name: string | null
  is_visible: boolean | null
  question_count?: number | null
}

type OptionRow = { option_key: string, content: string, is_correct: boolean, tip?: string | null, explanation?: string | null }
type StatementRow = { statement_key: string, content: string, correct_answer: boolean, score: number | null, tip?: string | null, explanation?: string | null }
type ShortAnswerRow = { content: string, score: number | null, tip?: string | null, explanation?: string | null }

type LessonQuestion = {
  id: string
  lesson_id: string
  question_type: 'single_choice' | 'true_false_group' | 'short_answer' | string
  content: string | null
  tip: string | null
  explanation: string | null
  image_url: string | null
  exam_score: number | null
  topic_unit: string | null
  difficulty_academic: string | null
  options: OptionRow[]
  statements: StatementRow[]
  short_answers: ShortAnswerRow[]
}

const DIFFS = [
  { value: 'biet', label: 'Biết' },
  { value: 'hieu', label: 'Hiểu' },
  { value: 'van_dung', label: 'Vận dụng' },
  { value: 'van_dung_cao', label: 'Vận dụng cao' },
]

const DIFF_LABEL: Record<string, string> = {
  biet: 'Biết',
  hieu: 'Hiểu',
  van_dung: 'Vận dụng',
  van_dung_cao: 'Vận dụng cao'
}

function previewTypeLabel(t: string | null) {
  if (t === 'single_choice') return 'Single choice'
  if (t === 'true_false_group') return 'True/False'
  if (t === 'short_answer') return 'Short answer'
  return t || '—'
}

function normalizeOptions(opts: any[]): OptionRow[] {
  const keys = ['A', 'B', 'C', 'D']
  const byKey: Record<string, OptionRow> = {}
  for (const o of opts || []) {
    const k = String(o.option_key || '').toUpperCase()
    if (!k) continue
    byKey[k] = {
      option_key: k,
      content: String(o.content || ''),
      is_correct: !!o.is_correct,
      tip: o.tip == null ? null : String(o.tip || ''),
      explanation: o.explanation == null ? null : String(o.explanation || ''),
    }
  }
  return keys.map(k => byKey[k] || ({ option_key: k, content: '', is_correct: false }))
}

function normalizeStatements(rows: any[]): StatementRow[] {
  const keys = ['a', 'b', 'c', 'd']
  const byKey: Record<string, StatementRow> = {}
  for (const s of rows || []) {
    const k = String(s.statement_key || '').toLowerCase()
    if (!k) continue
    byKey[k] = {
      statement_key: k,
      content: String(s.content || ''),
      correct_answer: s.correct_answer === true,
      score: s.score == null ? null : Number(s.score),
      tip: s.tip == null ? null : String(s.tip || ''),
      explanation: s.explanation == null ? null : String(s.explanation || ''),
    }
  }
  return keys.map(k => byKey[k] || ({ statement_key: k, content: '', correct_answer: false, score: null }))
}

function normalizeShortAnswers(rows: any[]): ShortAnswerRow[] {
  const out: ShortAnswerRow[] = []
  for (const a of rows || []) {
    const c = String(a.content || '').trim()
    if (!c) continue
    out.push({
      content: c,
      score: a.score == null ? null : Number(a.score),
      tip: a.tip == null ? null : String(a.tip || ''),
      explanation: a.explanation == null ? null : String(a.explanation || ''),
    })
  }
  return out.length ? out : [{ content: '', score: null }]
}

export default function LessonManageClient({ lessonId }: { lessonId: string }) {
  const [lesson, setLesson] = useState<LessonDetail | null>(null)
  const [questions, setQuestions] = useState<LessonQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [editingLesson, setEditingLesson] = useState(false)
  const [lessonTitleDraft, setLessonTitleDraft] = useState('')
  const [lessonDescDraft, setLessonDescDraft] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [mode, setMode] = useState<'create' | 'edit'>('edit')
  const [active, setActive] = useState<LessonQuestion | null>(null)

  const [qType, setQType] = useState<'single_choice' | 'true_false_group' | 'short_answer'>('single_choice')
  const [content, setContent] = useState('')
  const [tip, setTip] = useState('')
  const [explanation, setExplanation] = useState('')
  const [imageUrl, setImageUrl] = useState<string>('')
  const [difficulty, setDifficulty] = useState<string>('hieu')
  const [examScore, setExamScore] = useState<string>('0.25')
  const [options, setOptions] = useState<OptionRow[]>(normalizeOptions([]))
  const [correctKey, setCorrectKey] = useState<'A' | 'B' | 'C' | 'D'>('A')
  const [statements, setStatements] = useState<StatementRow[]>(normalizeStatements([]))
  const [shortAnswers, setShortAnswers] = useState<ShortAnswerRow[]>(normalizeShortAnswers([]))

  const [saving, setSaving] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [imgUploading, setImgUploading] = useState(false)

  const syncServerCookieOnce = useCallback(async () => {
    const { data: sess } = await supabaseBrowser.auth.getSession()
    const session = sess.session
    if (!session?.access_token || !session?.refresh_token) return false
    const r = await fetch('/api/auth/cookie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token
      })
    }).catch(() => null)
    return !!(r && r.ok)
  }, [])

  const fetchJson = useCallback(async (url: string, init?: RequestInit) => {
    let res = await fetch(url, { ...(init || {}), credentials: 'include' })
    if (res.status === 401) {
      const ok = await syncServerCookieOnce()
      if (ok) res = await fetch(url, { ...(init || {}), credentials: 'include' })
    }
    let j: any = null
    try {
      j = await res.json()
    } catch {
      const text = await res.text().catch(() => '')
      j = { error: text || 'Lỗi' }
    }
    return { res, ok: res.ok, j }
  }, [syncServerCookieOnce])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [d, q] = await Promise.all([
        fetchJson(`/api/teacher/lessons/${lessonId}/detail`),
        fetchJson(`/api/teacher/lessons/${lessonId}/questions`),
      ])
      setLoading(false)
      if (!d.ok) {
        if (d.res.status === 401) {
          window.location.href = '/login'
          return
        }
        setError(d.j?.error || 'Không thể tải bài học')
        return
      }
      if (!q.ok) {
        if (q.res.status === 401) {
          window.location.href = '/login'
          return
        }
        setError(q.j?.error || 'Không thể tải câu hỏi')
        return
      }
      const lessonData = d.j.lesson as LessonDetail
      setLesson(lessonData)
      setLessonTitleDraft(lessonData.title || '')
      setLessonDescDraft(lessonData.description || '')
      const items = Array.isArray(q.j.questions) ? q.j.questions : []
      setQuestions(items.map((x: any) => ({
        ...x,
        options: normalizeOptions(x.options || []),
        statements: normalizeStatements(x.statements || []),
        short_answers: normalizeShortAnswers(x.short_answers || []),
      })))
    } catch (e: any) {
      setLoading(false)
      setError(e?.message || 'Không thể tải dữ liệu')
    }
  }, [lessonId, fetchJson])

  useEffect(() => { load() }, [load])

  const openCreate = () => {
    setMode('create')
    setActive(null)
    setQType('single_choice')
    setContent('')
    setTip('')
    setExplanation('')
    setImageUrl('')
    setDifficulty('hieu')
    setExamScore('0.25')
    setOptions(normalizeOptions([]))
    setCorrectKey('A')
    setStatements(normalizeStatements([]))
    setShortAnswers(normalizeShortAnswers([]))
    setModalOpen(true)
  }

  const openEdit = (q: LessonQuestion) => {
    setMode('edit')
    setActive(q)
    setQType((q.question_type as any) || 'single_choice')
    setContent(q.content || '')
    setTip(q.tip || '')
    setExplanation(q.explanation || '')
    setImageUrl(q.image_url || '')
    setDifficulty(q.difficulty_academic || 'hieu')
    setExamScore(q.exam_score == null ? '' : String(q.exam_score))
    const normalizedOpts = normalizeOptions(q.options || [])
    setOptions(normalizedOpts)
    const correct = (normalizedOpts.find(o => o.is_correct)?.option_key || 'A') as any
    setCorrectKey(correct)
    setStatements(normalizeStatements(q.statements || []))
    setShortAnswers(normalizeShortAnswers(q.short_answers || []))
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setActive(null)
  }

  const canSave = useMemo(() => {
    if (!content.trim()) return false
    if (qType === 'single_choice') {
      const filled = options.filter(o => o.content.trim()).length
      if (filled < 2) return false
    }
    if (qType === 'true_false_group') {
      const filled = statements.filter(s => s.content.trim()).length
      if (filled < 2) return false
    }
    if (qType === 'short_answer') {
      const filled = shortAnswers.filter(a => a.content.trim()).length
      if (filled < 1) return false
    }
    return true
  }, [content, qType, options, statements, shortAnswers])

  const saveLesson = async () => {
    if (!lesson) return
    setSaving(true)
    setError('')
    const r = await fetchJson(`/api/teacher/lessons/${lesson.id}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: lessonTitleDraft, description: lessonDescDraft }),
    })
    setSaving(false)
    if (!r.ok) {
      setError(r.j?.error || 'Không thể lưu bài học')
      return
    }
    setEditingLesson(false)
    await load()
  }

  const deleteLesson = async () => {
    if (!lesson) return
    const ok = window.confirm(`Xóa bài học "${lesson.title}"? (Xóa mềm: ẩn khỏi học sinh)`)
    if (!ok) return
    setSaving(true)
    setError('')
    const r = await fetchJson(`/api/teacher/lessons/${lesson.id}/delete`, { method: 'POST' })
    setSaving(false)
    if (!r.ok) {
      setError(r.j?.error || 'Không thể xóa bài học')
      return
    }
    await load()
  }

  const uploadImage = async (file: File) => {
    setImgUploading(true)
    setError('')
    const form = new FormData()
    form.append('lesson_id', lessonId)
    form.append('file', file)
    const r = await fetchJson('/api/teacher/questions/upload-image', { method: 'POST', body: form })
    setImgUploading(false)
    if (!r.ok) {
      setError(r.j?.error || 'Upload ảnh thất bại')
      return
    }
    setImageUrl(String(r.j?.url || ''))
  }

  const genAi = async () => {
    setAiLoading(true)
    setError('')
    const payload: any = {
      question_type: qType,
      content,
      options: qType === 'single_choice' ? options.map(o => ({ option_key: o.option_key, content: o.content })) : undefined,
      correct_option_key: qType === 'single_choice' ? correctKey : undefined,
      statements: qType === 'true_false_group' ? statements.map(s => ({ statement_key: s.statement_key, content: s.content, correct_answer: s.correct_answer, score: s.score })) : undefined,
      short_answers: qType === 'short_answer' ? shortAnswers.map(a => ({ content: a.content, score: a.score })) : undefined,
      topic: '',
      difficulty: difficulty || '',
    }
    const r = await fetchJson('/api/teacher/questions/gen-tip-explanation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setAiLoading(false)
    if (!r.ok) {
      setError(r.j?.error || 'AI tạo tip/explain thất bại')
      return
    }
    setTip(String(r.j?.tip || ''))
    setExplanation(String(r.j?.explanation || ''))
  }

  const saveQuestion = async () => {
    if (!canSave) return
    setSaving(true)
    setError('')
    const common: any = {
      question_type: qType,
      content,
      tip,
      explanation,
      image_url: imageUrl || null,
      difficulty_academic: difficulty || null,
      exam_score: examScore.trim() ? Number(examScore) : null,
    }
    if (mode === 'edit') {
      common.topic_unit = active?.topic_unit ?? null
    }
    if (qType === 'single_choice') {
      common.options = options.map(o => ({ ...o, is_correct: o.option_key === correctKey }))
    }
    if (qType === 'true_false_group') {
      common.statements = statements
    }
    if (qType === 'short_answer') {
      common.short_answers = shortAnswers
    }

    const url = mode === 'create'
      ? `/api/teacher/lessons/${lessonId}/questions/create`
      : `/api/teacher/lessons/${lessonId}/questions/${active?.id}/update`

    const r = await fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(common),
    })
    setSaving(false)
    if (!r.ok) {
      setError(r.j?.error || 'Không thể lưu câu hỏi')
      return
    }
    closeModal()
    await load()
  }

  const removeQuestion = async (q: LessonQuestion) => {
    const ok = window.confirm('Xóa câu hỏi này khỏi bài học?')
    if (!ok) return
    setSaving(true)
    setError('')
    const r = await fetchJson(`/api/teacher/lessons/${lessonId}/questions/${q.id}/delete`, { method: 'POST' })
    setSaving(false)
    if (!r.ok) {
      setError(r.j?.error || 'Không thể xóa câu hỏi')
      return
    }
    await load()
  }

  const questionTitle = useMemo(() => {
    if (!lesson) return 'Bài học'
    const grade = lesson.grade_name ? ` • Khối ${lesson.grade_name}` : ''
    return `${lesson.title}${grade}`
  }, [lesson])

  if (loading) return <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Đang tải...</div>

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold truncate">{questionTitle}</h1>
          <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {lesson?.is_visible ? 'Đang hiển thị' : 'Đang ẩn'} • {questions.length} câu hỏi
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="h-9 px-3 text-sm" onClick={() => setEditingLesson(v => !v)}>
            {editingLesson ? 'Đóng sửa' : 'Sửa bài học'}
          </Button>
          <Button variant="outline" className="h-9 px-3 text-sm" onClick={deleteLesson} disabled={saving}>
            Xóa bài học
          </Button>
          <Button onClick={openCreate} disabled={saving}>Thêm câu hỏi</Button>
        </div>
      </div>

      {error ? <div className="text-red-500 text-sm">{error}</div> : null}

      {editingLesson && lesson ? (
        <Card>
          <CardHeader><CardTitle>Sửa bài học</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-sm">Tên bài học</label>
              <Input value={lessonTitleDraft} onChange={e => setLessonTitleDraft(e.target.value)} />
            </div>
            <div>
              <label className="text-sm">Mô tả</label>
              <Textarea value={lessonDescDraft} onChange={e => setLessonDescDraft(e.target.value)} />
            </div>
            <div className="flex items-center justify-end">
              <Button onClick={saveLesson} disabled={saving || !lessonTitleDraft.trim()}>
                {saving ? 'Đang lưu...' : 'Lưu'}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-3">
        {questions.map((q, idx) => (
          <div key={q.id} className="rounded-md border border-slate-700/60 bg-slate-900/30 p-4 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm font-semibold">
                Câu {idx + 1} · {previewTypeLabel(q.question_type)} · {q.topic_unit || '—'} · {DIFF_LABEL[String(q.difficulty_academic || '')] || q.difficulty_academic || '—'} · {q.exam_score ?? '—'}đ
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" className="h-8 px-3 text-sm" onClick={() => openEdit(q)}>Sửa</Button>
                <Button variant="outline" className="h-8 px-3 text-sm" onClick={() => removeQuestion(q)} disabled={saving}>Xóa</Button>
              </div>
            </div>

            <div className="text-sm whitespace-pre-line" style={{ color: 'var(--text)' }}>{q.content}</div>

            {q.image_url ? (
              <div className="rounded-md border border-slate-700/60 bg-slate-950/20 p-3">
                <img src={q.image_url} alt="question image" className="max-w-full h-auto rounded" />
              </div>
            ) : null}

            {q.question_type === 'single_choice' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                {q.options.map(o => (
                  <div key={o.option_key} className={`rounded-md border p-3 ${o.is_correct ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-slate-700/60 bg-slate-950/20'}`}>
                    <div className="font-semibold">{o.option_key}. <span className="font-normal">{o.content}</span></div>
                  </div>
                ))}
                <div className="sm:col-span-2 text-sm">
                  <span className="opacity-70">Đáp án đúng:</span>{' '}
                  <span className="text-emerald-200 font-semibold">{q.options.find(o => o.is_correct)?.option_key || '—'}</span>
                </div>
              </div>
            ) : null}

            {q.question_type === 'true_false_group' ? (
              <div className="space-y-2 text-sm">
                {q.statements.map(s => (
                  <div key={s.statement_key} className="rounded-md border border-slate-700/60 bg-slate-950/20 p-3 space-y-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-semibold">{s.statement_key ? `${s.statement_key}. ` : ''}<span className="font-normal">{s.content}</span></div>
                      <div className="text-xs opacity-80">{s.score ?? '—'}đ</div>
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

            {q.question_type === 'short_answer' ? (
              <div className="space-y-2 text-sm">
                <div className="rounded-md border border-slate-700/60 bg-slate-950/20 p-3">
                  <div className="text-xs opacity-70">Đáp án tham khảo</div>
                  <ul className="list-disc pl-5 mt-1 space-y-1">
                    {q.short_answers.map((a, i) => (
                      <li key={i}><span className="text-emerald-200 font-semibold">{a.content}</span> <span className="opacity-70">({a.score ?? '—'}đ)</span></li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}

            {q.explanation ? (
              <div className="p-3 rounded-md border border-blue-500/30 bg-blue-500/10 text-blue-100 text-sm whitespace-pre-line">
                <div className="font-semibold">Giải thích</div>
                <div className="mt-1">{q.explanation}</div>
              </div>
            ) : null}
            {q.tip ? (
              <div className="p-3 rounded-md border border-yellow-500/30 bg-yellow-500/10 text-yellow-100 text-sm italic whitespace-pre-line">
                <div className="not-italic font-semibold">Mẹo học nhanh</div>
                <div className="mt-1">{q.tip}</div>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-slate-950 border rounded p-4 space-y-4 max-h-[90vh] overflow-y-auto" style={{ borderColor: 'var(--divider)' }}>
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold">{mode === 'create' ? 'Thêm câu hỏi' : 'Sửa câu hỏi'}</div>
              <Button variant="outline" className="h-8 px-3 text-sm" onClick={closeModal}>Đóng</Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-sm">Loại câu hỏi</label>
                <select className="w-full mt-1 border rounded p-2 bg-transparent select-clean" value={qType} onChange={e => setQType(e.target.value as any)} disabled={mode === 'edit'}>
                  <option value="single_choice">Trắc nghiệm</option>
                  <option value="true_false_group">Đúng/Sai (nhóm)</option>
                  <option value="short_answer">Tự luận ngắn</option>
                </select>
              </div>
              <div>
                <label className="text-sm">Độ khó</label>
                <select className="w-full mt-1 border rounded p-2 bg-transparent select-clean" value={difficulty} onChange={e => setDifficulty(e.target.value)}>
                  {DIFFS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm">Điểm</label>
                <Input value={examScore} onChange={e => setExamScore(e.target.value)} placeholder="VD: 0.25" />
              </div>
            </div>

            <div>
              <label className="text-sm">Nội dung câu hỏi</label>
              <Textarea value={content} onChange={e => setContent(e.target.value)} rows={5} />
            </div>

            <div className="space-y-2">
              <label className="text-sm">Ảnh (tuỳ chọn)</label>
              {imageUrl ? <img src={imageUrl} alt="current" className="max-h-56 rounded border" style={{ borderColor: 'var(--divider)' }} /> : null}
              <input type="file" accept="image/*" onChange={e => {
                const f = (e.target.files || [])[0]
                if (f) uploadImage(f)
              }} />
              {imgUploading ? <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Đang upload ảnh...</div> : null}
            </div>

            {qType === 'single_choice' ? (
              <div className="space-y-2">
                <div className="text-sm font-semibold">Đáp án</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {options.map(o => (
                    <div key={o.option_key} className="border rounded p-2 space-y-2" style={{ borderColor: 'var(--divider)' }}>
                      <label className="text-sm font-semibold">{o.option_key}</label>
                      <Input value={o.content} onChange={e => setOptions(prev => prev.map(x => x.option_key === o.option_key ? { ...x, content: e.target.value } : x))} />
                      <label className="inline-flex items-center gap-2 text-sm">
                        <input type="radio" name="correct" checked={correctKey === o.option_key} onChange={() => setCorrectKey(o.option_key as any)} />
                        Đáp án đúng
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {qType === 'true_false_group' ? (
              <div className="space-y-2">
                <div className="text-sm font-semibold">Mệnh đề</div>
                <div className="space-y-2">
                  {statements.map(s => (
                    <div key={s.statement_key} className="border rounded p-2 space-y-2" style={{ borderColor: 'var(--divider)' }}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold">{s.statement_key}</div>
                        <label className="inline-flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={s.correct_answer} onChange={e => setStatements(prev => prev.map(x => x.statement_key === s.statement_key ? { ...x, correct_answer: e.target.checked } : x))} />
                          Đúng
                        </label>
                      </div>
                      <Textarea value={s.content} onChange={e => setStatements(prev => prev.map(x => x.statement_key === s.statement_key ? { ...x, content: e.target.value } : x))} rows={2} />
                      <Input value={s.score == null ? '' : String(s.score)} onChange={e => setStatements(prev => prev.map(x => x.statement_key === s.statement_key ? { ...x, score: e.target.value.trim() ? Number(e.target.value) : null } : x))} placeholder="Điểm (tuỳ chọn)" />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {qType === 'short_answer' ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold">Đáp án chấp nhận</div>
                  <Button variant="outline" className="h-8 px-3 text-sm" onClick={() => setShortAnswers(prev => [...prev, { content: '', score: null }])}>Thêm</Button>
                </div>
                <div className="space-y-2">
                  {shortAnswers.map((a, idx) => (
                    <div key={idx} className="border rounded p-2 space-y-2" style={{ borderColor: 'var(--divider)' }}>
                      <Input value={a.content} onChange={e => setShortAnswers(prev => prev.map((x, i) => i === idx ? { ...x, content: e.target.value } : x))} placeholder="Đáp án" />
                      <div className="flex items-center gap-2">
                        <Input value={a.score == null ? '' : String(a.score)} onChange={e => setShortAnswers(prev => prev.map((x, i) => i === idx ? { ...x, score: e.target.value.trim() ? Number(e.target.value) : null } : x))} placeholder="Điểm (tuỳ chọn)" />
                        <Button variant="outline" className="h-9 px-3 text-sm" onClick={() => setShortAnswers(prev => prev.filter((_, i) => i !== idx))} disabled={shortAnswers.length <= 1}>
                          Xóa
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-sm">Tip</label>
                  <Button variant="outline" className="h-8 px-3 text-sm" onClick={genAi} disabled={aiLoading}>
                    {aiLoading ? 'Đang tạo...' : 'AI tạo lại tip/explain'}
                  </Button>
                </div>
                <Textarea value={tip} onChange={e => setTip(e.target.value)} rows={4} />
              </div>
              <div>
                <label className="text-sm">Giải thích</label>
                <Textarea value={explanation} onChange={e => setExplanation(e.target.value)} rows={4} />
              </div>
            </div>

            {error ? <div className="text-red-500 text-sm">{error}</div> : null}

            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" className="h-9 px-3 text-sm" onClick={closeModal}>Hủy</Button>
              <Button onClick={saveQuestion} disabled={saving || !canSave}>
                {saving ? 'Đang lưu...' : 'Lưu'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
