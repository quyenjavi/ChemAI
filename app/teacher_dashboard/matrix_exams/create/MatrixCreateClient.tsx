'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type QuestionType = 'single_choice' | 'true_false' | 'short_answer'
type Diff = 'biet' | 'hieu' | 'van_dung' | 'van_dung_cao'

type Grade = { id: string, name: string }
type Lesson = { id: string, title: string, grade_id: string | null }
type LessonUnits = { id: string, title: string, topic_units: Array<{ key: string, topic_unit: string }> }

const DIFFS: Array<{ key: Diff, label: string }> = [
  { key: 'biet', label: 'Biết' },
  { key: 'hieu', label: 'Hiểu' },
  { key: 'van_dung', label: 'Vận dụng' },
  { key: 'van_dung_cao', label: 'Vận dụng cao' },
]

function typeLabel(t: QuestionType) {
  if (t === 'single_choice') return 'Single choice'
  if (t === 'true_false') return 'True/False'
  return 'Short answer'
}

function mapTypeToDb(t: QuestionType) {
  return t === 'true_false' ? 'true_false_group' : t
}

function parseUnitKey(k: string) {
  const raw = String(k || '').trim()
  const parts = raw.split('::')
  if (parts.length !== 2) return null
  const lessonId = String(parts[0] || '').trim()
  const encodedUnit = String(parts[1] || '').trim()
  if (!lessonId || !encodedUnit) return null
  return { lessonId, encodedUnit }
}

function buildEmptyMatrix(unitKeys: string[]) {
  const base: any = {}
  const types: QuestionType[] = ['single_choice', 'true_false', 'short_answer']
  for (const t of types) {
    base[t] = {}
    for (const k of unitKeys) {
      base[t][k] = { biet: 0, hieu: 0, van_dung: 0, van_dung_cao: 0 }
    }
  }
  return base
}

function formatScoreCents(scoreCents: number) {
  const n = Number((scoreCents / 100).toFixed(2))
  return Number.isFinite(n) ? n : 0
}

export default function MatrixCreateClient() {
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [meta, setMeta] = useState<{ grades: Grade[], lessons: Lesson[] } | null>(null)

  const [gradeId, setGradeId] = useState('')
  const [lessonQuery, setLessonQuery] = useState('')
  const [selectedLessons, setSelectedLessons] = useState<Lesson[]>([])
  const [title, setTitle] = useState('')

  const [lessonUnits, setLessonUnits] = useState<LessonUnits[]>([])
  const [availability, setAvailability] = useState<Record<string, number>>({})
  const [matrix, setMatrix] = useState<any>(null)
  const [creating, setCreating] = useState(false)

  const [pointsPerQuestion, setPointsPerQuestion] = useState<Record<QuestionType, number>>({
    single_choice: 0.25,
    true_false: 0.25,
    short_answer: 0.25
  })

  const router = useRouter()

  useEffect(() => {
    let mounted = true
    setLoading(true)
    fetch('/api/teacher/matrix-exams/meta', { credentials: 'include' })
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!mounted) return
        if (!ok) { setErr(j.error || 'Không thể tải dữ liệu'); return }
        setMeta(j)
        setGradeId(j.grades?.[0]?.id || '')
      })
      .catch(e => { if (mounted) setErr(e.message || 'Lỗi tải dữ liệu') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  const lessonsByGrade = useMemo(() => {
    const list = meta?.lessons || []
    return gradeId ? list.filter(l => l.grade_id === gradeId) : list
  }, [meta, gradeId])

  const filteredLessons = useMemo(() => {
    const q = lessonQuery.trim().toLowerCase()
    if (!q) return lessonsByGrade.slice(0, 20)
    return lessonsByGrade
      .filter(l => String(l.title || '').toLowerCase().includes(q))
      .slice(0, 20)
  }, [lessonsByGrade, lessonQuery])

  const selectedLessonIds = useMemo(() => selectedLessons.map(l => l.id), [selectedLessons])

  useEffect(() => {
    setLessonQuery('')
    setSelectedLessons([])
    setLessonUnits([])
    setAvailability({})
    setMatrix(null)
  }, [gradeId])

  const loadUnitsAndAvailability = useCallback(async (lIds: string[]) => {
    setErr('')
    const r = await fetch(`/api/teacher/matrix-exams/availability?lesson_ids=${encodeURIComponent(lIds.join(','))}`, { credentials: 'include' })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(j.error || 'Không thể tải topic units'); return }
    const groups = Array.isArray(j.lessons) ? j.lessons : []
    setLessonUnits(groups)
    setAvailability(j.counts || {})
    const keys: string[] = []
    for (const lg of groups) {
      const tus = Array.isArray(lg.topic_units) ? lg.topic_units : []
      for (const u of tus) {
        if (u?.key) keys.push(String(u.key))
      }
    }
    setMatrix(buildEmptyMatrix(keys))
    if (!title.trim()) setTitle(`Đề ma trận - ${new Date().toLocaleDateString()}`)
  }, [title])

  useEffect(() => {
    if (!selectedLessonIds.length) {
      setLessonUnits([])
      setAvailability({})
      setMatrix(null)
      return
    }
    loadUnitsAndAvailability(selectedLessonIds)
  }, [selectedLessonIds, loadUnitsAndAvailability])

  const allUnitKeys = useMemo(() => {
    const keys: string[] = []
    for (const lg of lessonUnits) {
      for (const u of lg.topic_units || []) keys.push(String(u.key))
    }
    return keys
  }, [lessonUnits])

  const totalRequested = useMemo(() => {
    if (!matrix) return 0
    let sum = 0
    for (const t of ['single_choice', 'true_false', 'short_answer'] as QuestionType[]) {
      for (const k of allUnitKeys) {
        const row = matrix[t]?.[k]
        if (!row) continue
        for (const d of DIFFS) sum += Number(row[d.key] || 0)
      }
    }
    return sum
  }, [matrix, allUnitKeys])

  const cellAvailable = useCallback((t: QuestionType, k: string, d: Diff) => {
    const parsed = parseUnitKey(k)
    if (!parsed) return 0
    const key = `${mapTypeToDb(t)}||${parsed.lessonId}||${parsed.encodedUnit}||${d}`
    return Number(availability[key] || 0)
  }, [availability])

  const hasOver = useMemo(() => {
    if (!matrix) return false
    for (const t of ['single_choice', 'true_false', 'short_answer'] as QuestionType[]) {
      for (const k of allUnitKeys) {
        const row = matrix[t]?.[k]
        if (!row) continue
        for (const d of DIFFS) {
          const n = Number(row[d.key] || 0)
          if (n > cellAvailable(t, k, d.key)) return true
        }
      }
    }
    return false
  }, [matrix, allUnitKeys, cellAvailable])

  const sectionCounts = useMemo(() => {
    const base: Record<QuestionType, number> = { single_choice: 0, true_false: 0, short_answer: 0 }
    if (!matrix) return base
    for (const t of ['single_choice', 'true_false', 'short_answer'] as QuestionType[]) {
      for (const k of allUnitKeys) {
        const row = matrix[t]?.[k]
        if (!row) continue
        for (const d of DIFFS) base[t] += Number(row[d.key] || 0)
      }
    }
    return base
  }, [matrix, allUnitKeys])

  const totalScoreCents = useMemo(() => {
    const s =
      sectionCounts.single_choice * Math.round(Number(pointsPerQuestion.single_choice || 0) * 100) +
      sectionCounts.true_false * Math.round(Number(pointsPerQuestion.true_false || 0) * 100) +
      sectionCounts.short_answer * Math.round(Number(pointsPerQuestion.short_answer || 0) * 100)
    return Number.isFinite(s) ? s : 0
  }, [sectionCounts, pointsPerQuestion])

  const canCreate = !!(title.trim() && gradeId && selectedLessonIds.length && totalRequested > 0 && !hasOver && !creating && totalScoreCents === 1000)

  const setCell = (t: QuestionType, k: string, d: Diff, value: number) => {
    setMatrix((prev: any) => {
      const next = { ...(prev || {}) }
      next[t] = { ...(next[t] || {}) }
      next[t][k] = { ...(next[t][k] || {}) }
      next[t][k][d] = value
      return next
    })
  }

  const create = async () => {
    setCreating(true)
    setErr('')
    const payload = {
      grade_id: gradeId,
      lesson_ids: selectedLessonIds,
      title,
      scoring_config: {
        version: 1,
        points_per_question: pointsPerQuestion
      },
      matrix_config: {
        version: 1,
        grade_id: gradeId,
        lesson_ids: selectedLessonIds,
        blocks: matrix
      }
    }
    const r = await fetch('/api/teacher/matrix-exams/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    })
    const j = await r.json().catch(() => ({}))
    setCreating(false)
    if (!r.ok) { setErr(j.error || 'Tạo đề thất bại'); return }
    router.push(`/teacher_dashboard/matrix_exams/${j.exam_id}`)
  }

  if (loading) return <div>Đang tải...</div>
  if (!meta) return <div className="p-3 rounded border border-rose-500/30 bg-rose-500/10 text-rose-100">{err || 'Không thể tải dữ liệu'}</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Tạo đề theo ma trận</h1>
        <Link href="/teacher_dashboard" className="underline" style={{color:'var(--gold)'}}>Quay lại</Link>
      </div>

      {err ? <div className="p-3 rounded border border-rose-500/30 bg-rose-500/10 text-rose-100">{err}</div> : null}

      <Card className="border" style={{borderColor:'var(--divider)'}}>
        <CardHeader><CardTitle>Chọn bài</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-sm">Khối</label>
            <select className="w-full mt-1 border rounded p-2 bg-transparent select-clean" value={gradeId} onChange={e => setGradeId(e.target.value)}>
              {meta.grades.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm">Thêm bài</label>
            <Input placeholder="Tìm bài theo từ khoá..." value={lessonQuery} onChange={e => setLessonQuery(e.target.value)} />
            <div className="mt-2 space-y-2">
              {filteredLessons.map(l => {
                const picked = selectedLessonIds.includes(l.id)
                return (
                  <div key={l.id} className="flex items-center justify-between gap-3 rounded border p-2" style={{borderColor:'var(--divider)'}}>
                    <div className="text-sm">{l.title}</div>
                    <Button
                      variant="outline"
                      disabled={picked}
                      onClick={() => {
                        setSelectedLessons(prev => prev.some(x => x.id === l.id) ? prev : [...prev, l])
                        setLessonQuery('')
                      }}
                    >
                      {picked ? 'Đã chọn' : 'Add'}
                    </Button>
                  </div>
                )
              })}
            </div>
            {selectedLessons.length ? (
              <div className="mt-3">
                <div className="text-xs mb-2" style={{color:'var(--text-muted)'}}>Bài đã chọn</div>
                <div className="flex flex-wrap gap-2">
                  {selectedLessons.map(l => (
                    <button
                      key={l.id}
                      className="text-sm rounded-full border px-3 py-1 bg-slate-950/20 hover:bg-rose-500/10"
                      style={{borderColor:'var(--divider)'}}
                      onClick={() => setSelectedLessons(prev => prev.filter(x => x.id !== l.id))}
                      type="button"
                    >
                      {l.title} ×
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <Input placeholder="Tiêu đề đề" value={title} onChange={e => setTitle(e.target.value)} />
          <div className="text-sm" style={{color:'var(--text-muted)'}}>Tổng số câu đã chọn: {totalRequested}</div>
        </CardContent>
      </Card>

      {selectedLessonIds.length && matrix ? (
        <div className="space-y-4">
          <Card className="border" style={{borderColor:'var(--divider)'}}>
            <CardHeader><CardTitle>Tóm tắt</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {(['single_choice', 'true_false', 'short_answer'] as QuestionType[]).map(t => {
                const c = sectionCounts[t]
                const ppq = Number(pointsPerQuestion[t] || 0)
                const score = formatScoreCents(c * Math.round(ppq * 100))
                return (
                  <div key={t} className="flex items-center justify-between">
                    <div className={c > 0 ? 'font-medium' : ''}>{typeLabel(t)}</div>
                    <div style={{color:'var(--text-muted)'}}>{c} câu × {ppq} = {score} điểm</div>
                  </div>
                )
              })}
              <div className="pt-2 border-t flex items-center justify-between" style={{borderColor:'var(--divider)'}}>
                <div className="font-semibold">Tổng</div>
                <div className={totalScoreCents === 1000 ? 'font-semibold' : 'text-rose-200'}>{totalRequested} câu = {formatScoreCents(totalScoreCents)} điểm</div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                {(['single_choice', 'true_false', 'short_answer'] as QuestionType[]).map(t => (
                  <div key={t} className="rounded border p-3" style={{borderColor:'var(--divider)'}}>
                    <div className="text-xs mb-1" style={{color:'var(--text-muted)'}}>Điểm / câu ({typeLabel(t)})</div>
                    <input
                      className="w-full bg-transparent outline-none"
                      type="number"
                      min={0}
                      step={0.01}
                      value={pointsPerQuestion[t]}
                      onChange={e => {
                        const v = Number(e.target.value || 0)
                        setPointsPerQuestion(prev => ({ ...prev, [t]: Math.max(0, Number.isFinite(v) ? v : 0) }))
                      }}
                    />
                  </div>
                ))}
              </div>
              {totalScoreCents !== 1000 ? <div className="text-rose-200">Tổng điểm phải bằng 10 để có thể tạo đề.</div> : null}
              {hasOver ? <div className="text-rose-200">Có ô vượt quá số câu hiện có trong ngân hàng.</div> : null}
            </CardContent>
          </Card>

          {(['single_choice', 'true_false', 'short_answer'] as QuestionType[]).map(t => (
            <Card key={t} className="border" style={{borderColor:'var(--divider)'}}>
              <CardHeader>
                <CardTitle className={sectionCounts[t] > 0 ? 'text-white' : ''}>
                  {typeLabel(t)} {sectionCounts[t] > 0 ? `— ${sectionCounts[t]} câu = ${formatScoreCents(sectionCounts[t] * Math.round(Number(pointsPerQuestion[t] || 0) * 100))} điểm` : ''}
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="text-left">
                      <th className="py-2 pr-3 bg-slate-950/80 backdrop-blur">Topic unit</th>
                      {DIFFS.map(d => <th key={d.key} className="py-2 pr-3 bg-slate-950/80 backdrop-blur">{d.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {lessonUnits.map(lg => (
                      <Fragment key={lg.id}>
                        <tr key={`${lg.id}__header`} className="border-t border-slate-800/60">
                          <td className="py-2 pr-3 font-semibold" colSpan={1 + DIFFS.length} style={{color:'var(--gold)'}}>{lg.title}</td>
                        </tr>
                        {(lg.topic_units || []).map(u => (
                          <tr key={u.key} className="border-t border-slate-800/60">
                            <td className="py-2 pr-3 font-medium">{u.topic_unit}</td>
                            {DIFFS.map(d => {
                              const n = Number(matrix?.[t]?.[u.key]?.[d.key] || 0)
                              const av = cellAvailable(t, u.key, d.key)
                              const over = n > av
                              return (
                                <td key={d.key} className="py-2 pr-3">
                                  <div className={`rounded-md border p-2 ${over ? 'border-rose-500/40 bg-rose-500/10' : n > 0 ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-slate-700/60 bg-slate-950/20'}`}>
                                    <input
                                      className="w-16 bg-transparent outline-none"
                                      type="number"
                                      min={0}
                                      value={n}
                                      onChange={e => setCell(t, u.key, d.key, Math.max(0, Number(e.target.value || 0)))}
                                    />
                                    <div className="text-xs opacity-70">/ {av}</div>
                                  </div>
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ))}

          <div className="flex justify-end">
            <Button onClick={create} disabled={!canCreate}>
              {creating ? 'Đang tạo...' : 'Tạo đề'}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
