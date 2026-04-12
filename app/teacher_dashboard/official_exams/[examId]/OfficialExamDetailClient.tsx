'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type ExamDetail = {
  id: string
  title: string
  school_id: string | null
  grade_id: string | null
  exam_date: string | null
  status: string | null
  lesson_id: string | null
  total_students: number
  total_sheets: number
  published_at: string | null
}

type PaperRow = {
  id: string
  paper_code: string
  lesson_id: string | null
  lesson_title: string | null
}

type LessonItem = { id: string, title: string, is_visible: boolean }

type BatchItem = { batch_id: string, batch_name: string | null, sheets_count: number }

type UnmatchedItem = {
  id: string
  detected_student_code: string | null
  detected_paper_code: string | null
  final_student_code: string | null
  final_paper_code: string | null
  student_id: string | null
  paper_id: string | null
  match_status: string | null
  process_status: string | null
  review_note: string | null
  reviewed_at: string | null
  duplicate_count_for_student_code: number
  flags: Record<string, boolean>
}

export default function OfficialExamDetailClient({ examId }: { examId: string }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exam, setExam] = useState<ExamDetail | null>(null)
  const [counts, setCounts] = useState<{ papers: number, students: number, sheets: number } | null>(null)
  const [papers, setPapers] = useState<PaperRow[]>([])

  const [lessons, setLessons] = useState<LessonItem[]>([])
  const [paperFormId, setPaperFormId] = useState<string | null>(null)
  const [paperFormCode, setPaperFormCode] = useState('')
  const [paperFormLessonId, setPaperFormLessonId] = useState('')
  const [savingPaper, setSavingPaper] = useState(false)
  const [deletingPaperId, setDeletingPaperId] = useState<string | null>(null)

  const [batches, setBatches] = useState<BatchItem[]>([])
  const [batchId, setBatchId] = useState<string>('')

  const [merging, setMerging] = useState(false)
  const [mergeResult, setMergeResult] = useState<any | null>(null)

  const [unmatchedLoading, setUnmatchedLoading] = useState(false)
  const [unmatched, setUnmatched] = useState<UnmatchedItem[]>([])
  const [unmatchedTotal, setUnmatchedTotal] = useState(0)
  const [editingSheetId, setEditingSheetId] = useState<string | null>(null)
  const [editFinalStudent, setEditFinalStudent] = useState('')
  const [editFinalPaper, setEditFinalPaper] = useState('')
  const [editNote, setEditNote] = useState('')
  const [savingSheet, setSavingSheet] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [dRes, papersRes, lessonsRes, batchesRes] = await Promise.all([
        fetch(`/api/teacher/official-exams/${examId}`, { credentials: 'include' }),
        fetch(`/api/teacher/official-exams/${examId}/papers`, { credentials: 'include' }),
        fetch(`/api/teacher/official-exams/${examId}/lesson`, { credentials: 'include' }),
        fetch(`/api/teacher/official-exams/${examId}/batches`, { credentials: 'include' })
      ])
      const d = await dRes.json().catch(() => ({}))
      const p = await papersRes.json().catch(() => ({}))
      const l = await lessonsRes.json().catch(() => ({}))
      const b = await batchesRes.json().catch(() => ({}))
      if (!dRes.ok) throw new Error(d.error || 'Không thể tải kì kiểm tra')
      if (!papersRes.ok) throw new Error(p.error || 'Không thể tải mã đề')
      if (!lessonsRes.ok) throw new Error(l.error || 'Không thể tải danh sách bài học')
      if (!batchesRes.ok) throw new Error(b.error || 'Không thể tải danh sách batch')
      setExam(d.exam)
      setCounts(d.counts)
      const paperItems = Array.isArray(p.papers) ? p.papers : []
      setPapers(paperItems.map((x: any) => ({
        id: String(x.id),
        paper_code: String(x.paper_code || ''),
        lesson_id: x.lesson_id ? String(x.lesson_id) : null,
        lesson_title: x.lesson_title ? String(x.lesson_title) : null
      })))
      setLessons(Array.isArray(l.lessons) ? l.lessons : [])
      const batchItems = Array.isArray(b.items) ? b.items : []
      setBatches(batchItems)
      if (!batchId) {
        const first = batchItems?.[0]?.batch_id ? String(batchItems[0].batch_id) : ''
        if (first) setBatchId(first)
      }
    } catch (e: any) {
      setError(e.message || 'Có lỗi xảy ra')
    } finally {
      setLoading(false)
    }
  }, [batchId, examId])

  const loadUnmatched = useCallback(async () => {
    if (!batchId) return
    setUnmatchedLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/teacher/official-exams/${examId}/unmatched?limit=200&batch_id=${encodeURIComponent(batchId)}`, { credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Không thể tải unmatched queue')
      setUnmatched(Array.isArray(json.items) ? json.items : [])
      setUnmatchedTotal(Number(json.total) || 0)
    } catch (e: any) {
      setError(e.message || 'Có lỗi xảy ra')
    } finally {
      setUnmatchedLoading(false)
    }
  }, [batchId, examId])

  useEffect(() => {
    load().then(loadUnmatched).catch(() => {})
  }, [load, loadUnmatched])

  const resetPaperForm = useCallback(() => {
    setPaperFormId(null)
    setPaperFormCode('')
    setPaperFormLessonId('')
    setError('')
  }, [])

  const openEditPaper = useCallback((p: PaperRow) => {
    setPaperFormId(p.id)
    setPaperFormCode(p.paper_code || '')
    setPaperFormLessonId(p.lesson_id || '')
    setError('')
  }, [])

  const savePaperForm = useCallback(async () => {
    const paper_code = paperFormCode.trim()
    const lesson_id = paperFormLessonId.trim()
    if (!paper_code) { setError('Thiếu paper_code'); return }
    if (!lesson_id) { setError('Thiếu lesson_id'); return }
    setSavingPaper(true)
    setError('')
    try {
      const res = await fetch(`/api/teacher/official-exams/${examId}/papers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          id: paperFormId,
          paper_code,
          lesson_id
        })
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Không thể lưu mã đề')
      resetPaperForm()
      await load()
    } catch (e: any) {
      setError(e.message || 'Có lỗi xảy ra')
    } finally {
      setSavingPaper(false)
    }
  }, [examId, load, paperFormCode, paperFormId, paperFormLessonId, resetPaperForm])

  const deletePaper = useCallback(async (id: string) => {
    const ok = window.confirm('Xóa mã đề này?')
    if (!ok) return
    setDeletingPaperId(id)
    setError('')
    try {
      const res = await fetch(`/api/teacher/official-exams/${examId}/papers`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id })
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Không thể xóa mã đề')
      if (paperFormId === id) resetPaperForm()
      await load()
    } catch (e: any) {
      setError(e.message || 'Có lỗi xảy ra')
    } finally {
      setDeletingPaperId(null)
    }
  }, [examId, load, paperFormId, resetPaperForm])

  const merge = useCallback(async () => {
    if (!batchId) return
    setMerging(true)
    setError('')
    setMergeResult(null)
    try {
      const res = await fetch(`/api/teacher/official-exams/${examId}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ batch_id: batchId })
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Merge thất bại')
      setMergeResult(json)
      await Promise.all([load(), loadUnmatched()])
    } catch (e: any) {
      setError(e.message || 'Có lỗi xảy ra')
    } finally {
      setMerging(false)
    }
  }, [batchId, examId, load, loadUnmatched])

  const openEditSheet = useCallback((it: UnmatchedItem) => {
    setEditingSheetId(it.id)
    setEditFinalStudent(it.final_student_code || '')
    setEditFinalPaper(it.final_paper_code || '')
    setEditNote(it.review_note || '')
  }, [])

  const saveSheet = useCallback(async () => {
    if (!editingSheetId) return
    setSavingSheet(true)
    setError('')
    try {
      const res = await fetch(`/api/teacher/official-exams/${examId}/sheets/${editingSheetId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          final_student_code: editFinalStudent,
          final_paper_code: editFinalPaper,
          review_note: editNote
        })
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Không thể lưu chỉnh sửa')
      await fetch(`/api/teacher/official-exams/${examId}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ sheet_ids: [editingSheetId] })
      })
      setEditingSheetId(null)
      await Promise.all([load(), loadUnmatched()])
    } catch (e: any) {
      setError(e.message || 'Có lỗi xảy ra')
    } finally {
      setSavingSheet(false)
    }
  }, [editFinalPaper, editFinalStudent, editNote, editingSheetId, examId, load, loadUnmatched])

  const publish = useCallback(async () => {
    setError('')
    try {
      const ok = window.confirm('Publish kì thi này? Sau khi publish, học sinh có thể claim điểm.')
      if (!ok) return
      const res = await fetch(`/api/teacher/official-exams/${examId}/publish`, { method: 'POST', credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Publish thất bại')
      await load()
    } catch (e: any) {
      setError(e.message || 'Có lỗi xảy ra')
    }
  }, [examId, load])

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="text-2xl font-semibold whitespace-normal break-words">{exam?.title || 'Official Exam'}</div>
          <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {exam?.grade_id ? <>Khối {exam.grade_id}</> : null}
            {exam?.exam_date ? <> · Ngày thi {new Date(exam.exam_date).toLocaleDateString()}</> : null}
          </div>
        </div>
        <Link href="/teacher_dashboard/official_exams" prefetch={false} className="underline">← Danh sách</Link>
      </div>

      {loading ? <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Đang tải…</div> : null}
      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      <Card>
        <CardHeader>
          <CardTitle>Thông tin chung</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>Trạng thái: <b>{exam?.status || 'draft'}</b></div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <div>Mã đề: <b>{counts?.papers ?? 0}</b></div>
            <div>Học sinh: <b>{exam?.total_students ?? (counts?.students ?? 0)}</b></div>
            <div>Bài làm: <b>{exam?.total_sheets ?? (counts?.sheets ?? 0)}</b></div>
          </div>
        </CardContent>
      </Card>

      <Card id="merge">
        <CardHeader>
          <CardTitle>Merge kết quả thi trường</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-semibold">Quản lý mã đề</div>
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Mỗi mã đề cần gắn với 1 bài học (lesson) để dùng cho merge và claim.
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-6 gap-2 items-end">
              <div className="sm:col-span-2 space-y-1">
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>paper_code</div>
                <Input value={paperFormCode} onChange={(e) => setPaperFormCode(e.target.value)} placeholder="VD: 001" />
              </div>
              <div className="sm:col-span-4 space-y-1">
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>lesson_id</div>
                <select
                  className="w-full border rounded px-3 py-2 text-sm bg-slate-950"
                  style={{ borderColor: 'var(--divider)' }}
                  value={paperFormLessonId}
                  onChange={(e) => setPaperFormLessonId(e.target.value)}
                >
                  <option value="">-- Chọn lesson --</option>
                  {lessons.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.title}{l.is_visible ? '' : ' [Hidden]'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 flex-wrap">
              <Button variant="outline" disabled={savingPaper} onClick={resetPaperForm}>Reset form</Button>
              <Button disabled={savingPaper} onClick={savePaperForm}>
                {savingPaper ? 'Đang lưu…' : (paperFormId ? 'Lưu' : 'Thêm')}
              </Button>
            </div>

            {!papers.length ? (
              <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Chưa có mã đề.</div>
            ) : (
              <div className="border rounded overflow-auto" style={{ borderColor: 'var(--divider)' }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b" style={{ borderColor: 'var(--divider)' }}>
                      <th className="text-left p-2">paper_code</th>
                      <th className="text-left p-2">lesson title</th>
                      <th className="text-left p-2">lesson_id</th>
                      <th className="text-left p-2">action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {papers.map((p) => (
                      <tr key={p.id} className="border-b" style={{ borderColor: 'var(--divider)' }}>
                        <td className="p-2 font-semibold">{p.paper_code}</td>
                        <td className="p-2">{p.lesson_title || '—'}</td>
                        <td className="p-2 text-xs" style={{ color: 'var(--text-muted)' }}>{p.lesson_id || '—'}</td>
                        <td className="p-2">
                          <div className="flex gap-2 flex-wrap">
                            <Button variant="outline" size="sm" onClick={() => openEditPaper(p)}>Edit</Button>
                            <Button variant="outline" size="sm" disabled={deletingPaperId === p.id} onClick={() => deletePaper(p.id)}>
                              {deletingPaperId === p.id ? 'Đang xóa…' : 'Delete'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="text-sm font-semibold">Merge</div>
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Chọn batch đã import, rồi merge để match sheet theo final_* (nếu có) hoặc detected_*.
            </div>
          </div>

          <div className="space-y-2">
            <div className="space-y-1">
              <div className="text-sm">Batch</div>
              <select
                className="w-full border rounded px-3 py-2 text-sm bg-slate-950"
                style={{ borderColor: 'var(--divider)' }}
                value={batchId}
                onChange={(e) => setBatchId(e.target.value)}
              >
                <option value="">-- Chọn batch_name --</option>
                {batches.map((b) => (
                  <option key={b.batch_id} value={b.batch_id}>
                    {(b.batch_name || b.batch_id)} ({b.sheets_count})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 flex-wrap">
              <Button variant="outline" disabled={unmatchedLoading} onClick={loadUnmatched}>
                {unmatchedLoading ? 'Đang tải…' : `Unmatched queue (${unmatchedTotal})`}
              </Button>
              <Button disabled={merging} onClick={merge}>
                {merging ? 'Đang merge…' : 'Merge'}
              </Button>
            </div>
            {mergeResult ? (
              <div className="p-3 rounded border border-[var(--divider)] text-sm">
                <div className="font-semibold">Kết quả merge</div>
                {mergeResult?.counts ? (
                  <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                    <div>Total students: <b>{mergeResult.counts.total_students}</b></div>
                    <div>Total sheets: <b>{mergeResult.counts.total_sheets}</b></div>
                    <div>Batch sheets: <b>{mergeResult.counts.batch_sheets}</b></div>
                    <div>Matched students: <b>{mergeResult.counts.matched_students}</b></div>
                    <div>Matched papers: <b>{mergeResult.counts.matched_papers}</b></div>
                    <div>Unmatched: <b>{mergeResult.counts.unmatched_count}</b></div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card id="unmatched">
        <CardHeader>
          <CardTitle>Unmatched queue</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Các sheet cần review: thiếu student/paper, mã nhận diện rỗng, trùng SBD trong cùng batch.
          </div>
          {!unmatched.length ? (
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {unmatchedLoading ? 'Đang tải…' : 'Không có item cần xử lý.'}
            </div>
          ) : (
            <div className="border rounded overflow-auto" style={{ borderColor: 'var(--divider)' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--divider)' }}>
                    <th className="text-left p-2">sheet_id</th>
                    <th className="text-left p-2">detected_student</th>
                    <th className="text-left p-2">detected_paper</th>
                    <th className="text-left p-2">final_student</th>
                    <th className="text-left p-2">final_paper</th>
                    <th className="text-left p-2">flags</th>
                    <th className="text-left p-2">action</th>
                  </tr>
                </thead>
                <tbody>
                  {unmatched.map((it) => (
                    <tr key={it.id} className="border-b" style={{ borderColor: 'var(--divider)' }}>
                      <td className="p-2" title={it.id}>{it.id.slice(0, 8)}</td>
                      <td className="p-2">{it.detected_student_code || '—'}</td>
                      <td className="p-2">{it.detected_paper_code || '—'}</td>
                      <td className="p-2">{it.final_student_code || '—'}</td>
                      <td className="p-2">{it.final_paper_code || '—'}</td>
                      <td className="p-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                        {Object.entries(it.flags || {}).filter(([, v]) => v).map(([k]) => k).join(', ') || '—'}
                        {it.duplicate_count_for_student_code > 1 ? ` (${it.duplicate_count_for_student_code} sheets)` : ''}
                      </td>
                      <td className="p-2">
                        <Button variant="outline" size="sm" onClick={() => openEditSheet(it)}>Sửa</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card id="export">
        <CardHeader>
          <CardTitle>Export</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex gap-3 flex-wrap items-center">
            <a href={`/api/teacher/official-exams/${examId}/export-scores`}>
              <Button>Xuất bảng điểm (Excel)</Button>
            </a>
          </div>
        </CardContent>
      </Card>

      <Card id="publish">
        <CardHeader>
          <CardTitle>Publish</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div style={{ color: 'var(--text-muted)' }}>
            Khi publish: set status=published và published_at=now().
          </div>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              Published at: <span style={{ color: 'var(--text)' }}>{exam?.published_at ? new Date(exam.published_at).toLocaleString() : '—'}</span>
            </div>
            <Button onClick={publish}>Publish</Button>
          </div>
        </CardContent>
      </Card>

      {editingSheetId ? (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setEditingSheetId(null)}>
          <div className="w-full max-w-lg rounded-lg border border-[var(--divider)] bg-slate-950 p-4 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <div className="text-lg font-semibold">Sửa sheet</div>
              <Button variant="ghost" size="sm" onClick={() => setEditingSheetId(null)}>Đóng</Button>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="text-sm">final_student_code</div>
                <Input value={editFinalStudent} onChange={(e) => setEditFinalStudent(e.target.value)} placeholder="Nhập SBD đúng" />
              </div>
              <div className="space-y-1">
                <div className="text-sm">final_paper_code</div>
                <Input value={editFinalPaper} onChange={(e) => setEditFinalPaper(e.target.value)} placeholder="Nhập mã đề đúng" />
              </div>
              <div className="space-y-1">
                <div className="text-sm">review_note</div>
                <Input value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="Ghi chú" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingSheetId(null)}>Hủy</Button>
              <Button disabled={savingSheet} onClick={saveSheet}>
                {savingSheet ? 'Đang lưu…' : 'Lưu & re-merge'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
