'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type QuestionType = 'single_choice' | 'true_false' | 'short_answer'
type DifficultyValue = string

type Grade = { id: string, name: string }
type Lesson = { id: string, title: string, grade_id: string | null, is_visible?: boolean | null }

type BlueprintRow = {
  id: string
  lesson_id: string
  difficulty: string
  quantity: number
}

type BlockState = {
  count: number
  points_per_question: number
  items: BlueprintRow[]
}

type MetaResponse = {
  can_create_exam: boolean
  grades: Grade[]
  lessons: Lesson[]
  difficulties: DifficultyValue[]
}

type PreviewItem = {
  exam_question_id: string
  question_order: number
  points: number
  blueprint_item_id: string | null
  question_id: string
  source_type?: string | null
  source_question_id?: string | null
  question_type: string | null
  lesson_id: string | null
  lesson_title: string | null
  topic_unit?: string | null
  difficulty_academic?: string | null
  difficulty: string | null
  content: string
  image_url?: string | null
  image_alt?: string | null
  image_caption?: string | null
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

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function quarterValid(x: number) {
  const v = Math.round(x * 1000)
  return v % 250 === 0
}

function fmt2(n: number) {
  return (Math.round(n * 100) / 100).toFixed(2)
}

function typeLabel(t: QuestionType) {
  return t === 'single_choice' ? 'Single Choice' : t === 'true_false' ? 'True / False' : 'Short Answer'
}

function previewTypeLabel(t: string | null) {
  if (t === 'single_choice') return 'Single Choice'
  if (t === 'true_false' || t === 'true_false_group') return 'True / False'
  if (t === 'short_answer') return 'Short Answer'
  return t || '—'
}

function statusText(allocated: number, target: number) {
  if (allocated === target) return `Đã phân bổ ${allocated}/${target} câu`
  if (allocated < target) return `Đã phân bổ ${allocated}/${target} câu`
  return `Đã vượt ${allocated}/${target} câu`
}

export default function CreateExamClient() {
  const [meta, setMeta] = useState<MetaResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [gradeId, setGradeId] = useState('')

  const [blocks, setBlocks] = useState<Record<QuestionType, BlockState>>({
    single_choice: { count: 16, points_per_question: 0.25, items: [] },
    true_false: { count: 0, points_per_question: 0.25, items: [] },
    short_answer: { count: 0, points_per_question: 1, items: [] },
  })

  const [creating, setCreating] = useState(false)
  const [examId, setExamId] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewItem[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)
  const [replaceLoadingId, setReplaceLoadingId] = useState<string | null>(null)
  const [aiLoadingId, setAiLoadingId] = useState<string | null>(null)
  const [dupLoading, setDupLoading] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')
  const router = useRouter()

  useEffect(() => {
    let mounted = true
    setLoading(true)
    fetch('/api/teacher/exams/meta', { credentials: 'include' })
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!mounted) return
        if (!ok) {
          setErr(j.error || 'Không thể tải dữ liệu')
          setMeta(null)
          return
        }
        setMeta(j)
        setGradeId((j.grades?.[0]?.id) || '')
      })
      .catch(e => {
        if (!mounted) return
        setErr(e.message || 'Lỗi tải dữ liệu')
      })
      .finally(() => {
        if (!mounted) return
        setLoading(false)
      })
    return () => { mounted = false }
  }, [])

  const lessonsByGrade = useMemo(() => {
    const list = meta?.lessons || []
    return gradeId ? list.filter(l => l.grade_id === gradeId) : list
  }, [meta, gradeId])

  const blockStats = useMemo(() => {
    const out: Record<QuestionType, { allocated: number, groupPoints: number, ok: boolean, error: string }> = {
      single_choice: { allocated: 0, groupPoints: 0, ok: true, error: '' },
      true_false: { allocated: 0, groupPoints: 0, ok: true, error: '' },
      short_answer: { allocated: 0, groupPoints: 0, ok: true, error: '' },
    }
    ;(Object.keys(blocks) as QuestionType[]).forEach(t => {
      const b = blocks[t]
      const allocated = b.items.reduce((acc, r) => acc + (Number(r.quantity) || 0), 0)
      const groupPoints = (Number(b.count) || 0) * (Number(b.points_per_question) || 0)
      let ok = allocated === b.count
      let error = ''
      if (b.count === 0) ok = true
      if (b.count > 0 && !ok) error = statusText(allocated, b.count)
      if (t === 'single_choice' && b.count > 0 && !quarterValid(Number(b.points_per_question) || 0)) {
        ok = false
        error = 'Điểm mỗi câu Single Choice phải là bội số của 0.25'
      }
      out[t] = { allocated, groupPoints, ok, error }
    })
    return out
  }, [blocks])

  const totalPoints = useMemo(() => {
    return (Object.keys(blocks) as QuestionType[]).reduce((acc, t) => acc + blockStats[t].groupPoints, 0)
  }, [blockStats, blocks])

  const canCreate = useMemo(() => {
    const totalOk = Math.round(totalPoints * 100) / 100 === 10
    const blocksOk = (Object.keys(blocks) as QuestionType[]).every(t => blockStats[t].ok)
    return !!(title.trim() && gradeId && totalOk && blocksOk && !creating)
  }, [title, gradeId, totalPoints, blockStats, blocks, creating])

  const addRow = (t: QuestionType) => {
    setBlocks(prev => {
      const next = { ...prev }
      next[t] = {
        ...next[t],
        items: [...next[t].items, { id: makeId(), lesson_id: lessonsByGrade[0]?.id || '', difficulty: '', quantity: 1 }]
      }
      return next
    })
  }

  const removeRow = (t: QuestionType, id: string) => {
    setBlocks(prev => {
      const next = { ...prev }
      next[t] = { ...next[t], items: next[t].items.filter(x => x.id !== id) }
      return next
    })
  }

  const updateRow = (t: QuestionType, id: string, patch: Partial<BlueprintRow>) => {
    setBlocks(prev => {
      const next = { ...prev }
      next[t] = {
        ...next[t],
        items: next[t].items.map(r => r.id === id ? { ...r, ...patch } : r)
      }
      return next
    })
  }

  const setBlockField = (t: QuestionType, patch: Partial<BlockState>) => {
    setBlocks(prev => ({ ...prev, [t]: { ...prev[t], ...patch } }))
  }

  const loadPreview = async (id: string) => {
    setPreviewLoading(true)
    setErr('')
    const r = await fetch(`/api/teacher/exams/${id}/preview`, { credentials: 'include' })
    const j = await r.json().catch(() => ({}))
    setPreviewLoading(false)
    if (!r.ok) { setErr(j.error || 'Không thể tải preview'); return }
    setPreview(Array.isArray(j.items) ? j.items : [])
  }

  const createExam = async () => {
    setCreating(true)
    setErr('')
    const payload = {
      title,
      description,
      grade_id: gradeId,
      blocks
    }
    const r = await fetch('/api/teacher/exams/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'include'
    })
    const j = await r.json().catch(() => ({}))
    setCreating(false)
    if (!r.ok) { setErr(j.error || 'Tạo đề thất bại'); return }
    const id = j.exam_id as string
    setExamId(id)
    router.push(`/teacher_dashboard/exams/${id}`)
  }

  const replaceQuestion = async (examQuestionId: string) => {
    if (!examId) return
    setReplaceLoadingId(examQuestionId)
    setErr('')
    const r = await fetch(`/api/teacher/exams/${examId}/questions/${examQuestionId}/replace`, {
      method: 'POST',
      credentials: 'include'
    })
    const j = await r.json().catch(() => ({}))
    setReplaceLoadingId(null)
    if (!r.ok) { setErr(j.error || 'Đổi câu thất bại'); return }
    await loadPreview(examId)
  }

  const regenerateAi = async (examQuestionId: string) => {
    if (!examId) return
    setAiLoadingId(examQuestionId)
    setErr('')
    const r = await fetch(`/api/teacher/exams/${examId}/questions/${examQuestionId}/ai-regenerate`, {
      method: 'POST',
      credentials: 'include'
    })
    const j = await r.json().catch(() => ({}))
    setAiLoadingId(null)
    if (!r.ok) { setErr(j.error || 'AI tạo lại thất bại'); return }
    await loadPreview(examId)
  }

  const duplicateAi = async () => {
    if (!examId) return
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
    setExamId(newId)
    await loadPreview(newId)
  }

  const saveExam = async () => {
    if (!examId) return
    setSaveLoading(true)
    setErr('')
    setSavedMsg('')
    const r = await fetch(`/api/teacher/exams/${examId}/save`, { method: 'POST', credentials: 'include' })
    const j = await r.json().catch(() => ({}))
    setSaveLoading(false)
    if (!r.ok) { setErr(j.error || 'Lưu đề thất bại'); return }
    setSavedMsg('Đã lưu đề (draft). Chưa publish cho học sinh.')
  }

  if (loading) return <div>Đang tải...</div>
  if (!meta) return <div>Không thể tải dữ liệu</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Tạo đề</h1>
        <Link href="/teacher_dashboard" className="underline" style={{color:'var(--gold)'}}>Quay lại</Link>
      </div>
      {err ? <div className="p-3 rounded border border-rose-500/30 bg-rose-500/10 text-rose-100">{err}</div> : null}

      <Card className="border" style={{borderColor:'var(--divider)'}}>
        <CardHeader><CardTitle>Thông tin đề</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Tiêu đề" value={title} onChange={e => setTitle(e.target.value)} />
          <Input placeholder="Mô tả (tuỳ chọn)" value={description} onChange={e => setDescription(e.target.value)} />
          <div>
            <label className="text-sm">Khối</label>
            <select className="w-full mt-1 border rounded p-2 bg-transparent select-clean" value={gradeId} onChange={e => setGradeId(e.target.value)}>
              {meta.grades.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        </CardContent>
      </Card>

      <Card className="border" style={{borderColor:'var(--divider)'}}>
        <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(Object.keys(blocks) as QuestionType[]).map(t => {
            const b = blocks[t]
            if (b.count <= 0) return null
            return (
              <div key={t} className="flex items-center justify-between gap-3">
                <div>{typeLabel(t)}: {b.count} × {b.points_per_question} = {fmt2(blockStats[t].groupPoints)}</div>
                <div className={blockStats[t].ok ? 'text-emerald-200' : 'text-rose-200'}>{blockStats[t].ok ? 'OK' : blockStats[t].error}</div>
              </div>
            )
          })}
          <div className="pt-2 flex items-center justify-between">
            <div className="font-semibold">Tổng điểm: {fmt2(totalPoints)} / 10</div>
          </div>
        </CardContent>
      </Card>

      {(Object.keys(blocks) as QuestionType[]).map(t => (
        <BlockEditor
          key={t}
          t={t}
          block={blocks[t]}
          meta={meta}
          lessons={lessonsByGrade}
          onSetField={(p) => setBlockField(t, p)}
          onAdd={() => addRow(t)}
          onRemove={(id) => removeRow(t, id)}
          onUpdate={(id, p) => updateRow(t, id, p)}
          stats={blockStats[t]}
        />
      ))}

      <div className="flex justify-end">
        <Button onClick={createExam} disabled={!canCreate}>
          {creating ? 'Đang tạo...' : 'Tạo đề'}
        </Button>
      </div>

      {examId ? (
        <Card className="border" style={{borderColor:'var(--divider)'}}>
          <CardHeader><CardTitle>Preview</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={saveExam} disabled={saveLoading}>
                {saveLoading ? 'Đang lưu...' : 'Lưu đề'}
              </Button>
              <Button variant="outline" onClick={duplicateAi} disabled={dupLoading}>
                {dupLoading ? 'Đang tạo...' : 'AI Duplicate đề'}
              </Button>
            </div>
            {savedMsg ? <div className="p-3 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-100 text-sm">{savedMsg}</div> : null}
            {previewLoading ? <div>Đang tải preview...</div> : null}
            {preview.map(it => (
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
                {it.image_url ? (
                  <div className="rounded-md border border-slate-700/60 bg-slate-950/20 p-3">
                    <img src={it.image_url} alt={it.image_alt || 'question image'} className="max-w-full h-auto rounded" />
                    {it.image_caption ? <div className="text-xs mt-2 opacity-80">{it.image_caption}</div> : null}
                  </div>
                ) : null}

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
      ) : null}
    </div>
  )
}

function BlockEditor({
  t,
  block,
  stats,
  meta,
  lessons,
  onSetField,
  onAdd,
  onRemove,
  onUpdate,
}: {
  t: QuestionType
  block: BlockState
  stats: { allocated: number, groupPoints: number, ok: boolean, error: string }
  meta: MetaResponse
  lessons: Lesson[]
  onSetField: (p: Partial<BlockState>) => void
  onAdd: () => void
  onRemove: (id: string) => void
  onUpdate: (id: string, p: Partial<BlueprintRow>) => void
}) {
  const show = block.count > 0
  return (
    <Card className="border" style={{borderColor:'var(--divider)'}}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          <span>{typeLabel(t)}</span>
          {show ? <span className="text-sm" style={{color:'var(--text-muted)'}}>Tổng điểm nhóm: {fmt2(stats.groupPoints)}</span> : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-sm">Số câu</label>
            <Input value={String(block.count)} onChange={e => onSetField({ count: Number(e.target.value || 0), items: Number(e.target.value || 0) <= 0 ? [] : block.items })} />
          </div>
          <div>
            <label className="text-sm">Điểm mỗi câu</label>
            <Input value={String(block.points_per_question)} onChange={e => onSetField({ points_per_question: Number(e.target.value || 0) })} />
          </div>
          <div className="flex items-end">
            <div className={`text-sm ${stats.ok ? 'text-emerald-200' : 'text-rose-200'}`}>{show ? statusText(stats.allocated, block.count) : 'Không dùng phần này'}</div>
          </div>
        </div>

        {!stats.ok && show ? <div className="text-sm text-rose-200">{stats.error}</div> : null}

        {show ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Cấu hình</div>
              <Button variant="outline" onClick={onAdd}>Add</Button>
            </div>
            {block.items.length ? (
              <div className="space-y-2">
                {block.items.map((r, idx) => (
                  <div key={r.id} className="rounded-md border border-slate-700/60 bg-slate-900/30 p-3 grid grid-cols-1 md:grid-cols-12 gap-2">
                    <div className="md:col-span-6">
                      <label className="text-xs" style={{color:'var(--text-muted)'}}>Bài</label>
                      <select className="w-full mt-1 border rounded p-2 bg-transparent select-clean" value={r.lesson_id} onChange={e => onUpdate(r.id, { lesson_id: e.target.value })}>
                        <option value="" disabled>Chọn bài</option>
                        {lessons.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
                      </select>
                    </div>
                    <div className="md:col-span-3">
                      <label className="text-xs" style={{color:'var(--text-muted)'}}>Độ khó</label>
                      <select className="w-full mt-1 border rounded p-2 bg-transparent select-clean" value={r.difficulty} onChange={e => onUpdate(r.id, { difficulty: e.target.value })}>
                        <option value="">Any</option>
                        {meta.difficulties.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-xs" style={{color:'var(--text-muted)'}}>Số câu</label>
                      <Input value={String(r.quantity)} onChange={e => onUpdate(r.id, { quantity: Number(e.target.value || 0) })} />
                    </div>
                    <div className="md:col-span-1 flex items-end">
                      <Button variant="outline" onClick={() => onRemove(r.id)}>Remove</Button>
                    </div>
                    <input type="hidden" value={idx} readOnly />
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm" style={{color:'var(--text-muted)'}}>Chưa có dòng cấu hình.</div>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
