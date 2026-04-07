'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type ExamDetail = {
  id: string
  exam_title: string
  grade_id: string | null
  grade_name: string | null
  subject_name: string | null
  exam_date: string | null
  status: string | null
  description: string | null
  academic_year: string | null
}

type PaperRow = {
  id: string
  paper_code: string
  process_status: string
  lesson_id: string | null
  lesson_title: string | null
  lesson_question_count: number
}

type LessonItem = { id: string, title: string, is_visible: boolean }

type SheetItem = {
  id: string
  sheet_no: number | null
  detected_student_code: string | null
  detected_paper_code: string | null
  match_status: string | null
  process_status: string | null
  signed_url: string | null
  created_at: string | null
}

type ScoreRow = {
  id: string
  student_code: string | null
  full_name: string | null
  class_name: string | null
  paper_code: string | null
  lesson_title: string | null
  raw_score: any
  total_score: any
  correct_count: any
  wrong_count: any
  blank_count: any
  grading_status: string | null
  graded_at: string | null
}

export default function OfficialExamDetailClient({ examId }: { examId: string }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exam, setExam] = useState<ExamDetail | null>(null)
  const [counts, setCounts] = useState<{ papers: number, students: number, sheets: number, graded: number } | null>(null)
  const [papers, setPapers] = useState<PaperRow[]>([])
  const [lessons, setLessons] = useState<LessonItem[]>([])

  const [paperCodeDraft, setPaperCodeDraft] = useState('')
  const [lessonIdDraft, setLessonIdDraft] = useState('')
  const [savingPaper, setSavingPaper] = useState(false)

  const [validating, setValidating] = useState(false)
  const [validation, setValidation] = useState<any | null>(null)

  const [excelFile, setExcelFile] = useState<File | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [preview, setPreview] = useState<any | null>(null)
  const [importing, setImporting] = useState(false)

  const [sheetFiles, setSheetFiles] = useState<File[]>([])
  const [uploadingSheets, setUploadingSheets] = useState(false)
  const [sheetsLoading, setSheetsLoading] = useState(false)
  const [sheets, setSheets] = useState<SheetItem[]>([])
  const [processing, setProcessing] = useState(false)
  const [processResult, setProcessResult] = useState<any | null>(null)

  const [scoresLoading, setScoresLoading] = useState(false)
  const [scores, setScores] = useState<ScoreRow[]>([])

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const sheetInputRef = useRef<HTMLInputElement | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    setValidation(null)
    try {
      const [dRes, pRes] = await Promise.all([
        fetch(`/api/teacher/official-exams/${examId}`, { credentials: 'include' }),
        fetch(`/api/teacher/official-exams/${examId}/papers`, { credentials: 'include' })
      ])
      const d = await dRes.json().catch(() => ({}))
      const p = await pRes.json().catch(() => ({}))
      if (!dRes.ok) throw new Error(d.error || 'Không thể tải kì kiểm tra')
      if (!pRes.ok) throw new Error(p.error || 'Không thể tải mã đề')
      setExam(d.exam)
      setCounts(d.counts)
      setPapers(Array.isArray(d.papers) ? d.papers : [])
      setLessons(Array.isArray(p.lessons) ? p.lessons : [])
    } catch (e: any) {
      setError(e.message || 'Có lỗi xảy ra')
    } finally {
      setLoading(false)
    }
  }, [examId])

  const loadSheets = useCallback(async () => {
    setSheetsLoading(true)
    try {
      const res = await fetch(`/api/teacher/official-exams/${examId}/sheets?limit=30`, { credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Không thể tải bài làm đã upload')
      setSheets(Array.isArray(json.items) ? json.items : [])
    } finally {
      setSheetsLoading(false)
    }
  }, [examId])

  const loadScores = useCallback(async () => {
    setScoresLoading(true)
    try {
      const res = await fetch(`/api/teacher/official-exams/${examId}/scores?limit=200`, { credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Không thể tải bảng điểm')
      setScores(Array.isArray(json.items) ? json.items : [])
    } finally {
      setScoresLoading(false)
    }
  }, [examId])

  useEffect(() => {
    load().then(async () => {
      await Promise.all([loadSheets(), loadScores()])
    }).catch(() => {})
  }, [load, loadScores, loadSheets])

  const canAddPaper = useMemo(() => {
    return !!paperCodeDraft.trim() && !!lessonIdDraft
  }, [lessonIdDraft, paperCodeDraft])

  const savePaper = useCallback(async () => {
    if (!canAddPaper) return
    setSavingPaper(true)
    setError('')
    try {
      const res = await fetch(`/api/teacher/official-exams/${examId}/papers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ paper_code: paperCodeDraft.trim(), lesson_id: lessonIdDraft })
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Không thể lưu mã đề')
      setPaperCodeDraft('')
      setLessonIdDraft('')
      await load()
    } catch (e: any) {
      setError(e.message || 'Có lỗi xảy ra')
    } finally {
      setSavingPaper(false)
    }
  }, [canAddPaper, examId, lessonIdDraft, load, paperCodeDraft])

  const validate = useCallback(async () => {
    setValidating(true)
    setError('')
    try {
      const res = await fetch(`/api/teacher/official-exams/${examId}/validate`, { method: 'POST', credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Không thể kiểm tra')
      setValidation(json)
      await load()
    } catch (e: any) {
      setError(e.message || 'Có lỗi xảy ra')
    } finally {
      setValidating(false)
    }
  }, [examId, load])

  const previewExcel = useCallback(async (file: File) => {
    setPreviewLoading(true)
    setError('')
    setPreview(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/teacher/official-exams/${examId}/students/preview`, {
        method: 'POST',
        body: form,
        credentials: 'include'
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Không thể đọc file Excel')
      setPreview(json)
    } catch (e: any) {
      setError(e.message || 'Có lỗi xảy ra')
    } finally {
      setPreviewLoading(false)
    }
  }, [examId])

  const importStudents = useCallback(async () => {
    if (!preview?.items?.length) return
    setImporting(true)
    setError('')
    try {
      const res = await fetch(`/api/teacher/official-exams/${examId}/students/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ items: preview.items })
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Import thất bại')
      setPreview(null)
      setExcelFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      await load()
    } catch (e: any) {
      setError(e.message || 'Có lỗi xảy ra')
    } finally {
      setImporting(false)
    }
  }, [examId, load, preview])

  const compressImage = useCallback(async (file: File) => {
    const img = document.createElement('img')
    const url = URL.createObjectURL(file)
    try {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('Không đọc được ảnh'))
        img.src = url
      })
      const maxW = 1600
      const maxH = 1600
      const w = img.naturalWidth || img.width
      const h = img.naturalHeight || img.height
      const scale = Math.min(1, maxW / w, maxH / h)
      const outW = Math.max(1, Math.round(w * scale))
      const outH = Math.max(1, Math.round(h * scale))
      const canvas = document.createElement('canvas')
      canvas.width = outW
      canvas.height = outH
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas not supported')
      ctx.drawImage(img, 0, 0, outW, outH)
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Nén ảnh thất bại'))), 'image/jpeg', 0.75)
      })
      return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
    } finally {
      URL.revokeObjectURL(url)
    }
  }, [])

  const uploadSheets = useCallback(async () => {
    if (!sheetFiles.length) return
    setUploadingSheets(true)
    setError('')
    setProcessResult(null)
    try {
      const compressed: File[] = []
      for (const f of sheetFiles) {
        if (!f.type.startsWith('image/')) continue
        compressed.push(await compressImage(f))
      }
      if (!compressed.length) throw new Error('Chỉ hỗ trợ ảnh (JPG/PNG) trong version này')

      const form = new FormData()
      compressed.forEach((f) => form.append('files', f))
      const res = await fetch(`/api/teacher/official-exams/${examId}/sheets/upload`, {
        method: 'POST',
        body: form,
        credentials: 'include'
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Upload thất bại')
      setSheetFiles([])
      if (sheetInputRef.current) sheetInputRef.current.value = ''
      await Promise.all([load(), loadSheets()])
    } catch (e: any) {
      setError(e.message || 'Có lỗi xảy ra')
    } finally {
      setUploadingSheets(false)
    }
  }, [compressImage, examId, load, loadSheets, sheetFiles])

  const processNext = useCallback(async () => {
    setProcessing(true)
    setError('')
    try {
      const res = await fetch(`/api/teacher/official-exams/${examId}/process-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ limit: 5 })
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Xử lý thất bại')
      setProcessResult(json)
      await Promise.all([load(), loadSheets(), loadScores()])
    } catch (e: any) {
      setError(e.message || 'Có lỗi xảy ra')
    } finally {
      setProcessing(false)
    }
  }, [examId, load, loadScores, loadSheets])

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="text-2xl font-semibold whitespace-normal break-words">{exam?.exam_title || 'Official Exam'}</div>
          <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {exam?.grade_name ? <>Khối {exam.grade_name}</> : null}
            {exam?.subject_name ? <> · {exam.subject_name}</> : null}
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
          <div>Trạng thái: <b>{exam?.status || 'Draft'}</b></div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>Mã đề: <b>{counts?.papers ?? 0}</b></div>
            <div>Học sinh: <b>{counts?.students ?? 0}</b></div>
            <div>Bài làm: <b>{counts?.sheets ?? 0}</b></div>
            <div>Đã chấm: <b>{counts?.graded ?? 0}</b></div>
          </div>
          {exam?.description ? <div className="pt-2" style={{ color: 'var(--text-muted)' }}>{exam.description}</div> : null}
        </CardContent>
      </Card>

      <Card id="papers">
        <CardHeader>
          <CardTitle>Mã đề / Lessons</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="space-y-1">
              <div className="text-sm">Mã đề</div>
              <Input value={paperCodeDraft} onChange={(e) => setPaperCodeDraft(e.target.value)} placeholder="Ví dụ: 101" />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <div className="text-sm">Lesson</div>
              <select className="w-full border rounded px-3 py-2 text-sm bg-slate-950" style={{ borderColor: 'var(--divider)' }} value={lessonIdDraft} onChange={(e) => setLessonIdDraft(e.target.value)}>
                <option value="">-- Chọn lesson --</option>
                {lessons.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.title}{l.is_visible ? '' : ' [Hidden]'}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end">
            <Button disabled={!canAddPaper || savingPaper} onClick={savePaper}>
              {savingPaper ? 'Đang lưu…' : 'Thêm / Cập nhật mã đề'}
            </Button>
          </div>

          {!papers.length ? (
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Chưa có mã đề nào.</div>
          ) : (
            <div className="space-y-2">
              {papers.map((p) => (
                <div key={p.id} className="border rounded p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2" style={{ borderColor: 'var(--divider)' }}>
                  <div className="min-w-0">
                    <div className="font-semibold">Mã đề {p.paper_code}</div>
                    <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      Lesson: <span style={{ color: 'var(--text)' }}>{p.lesson_title || '—'}</span>
                      {' '}· Số câu: <span style={{ color: 'var(--text)' }}>{p.lesson_question_count ?? 0}</span>
                    </div>
                  </div>
                  <div className="text-xs px-2 py-1 rounded border w-fit" style={{ borderColor: 'var(--divider)' }}>
                    {p.process_status}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Chỉ khi “Kiểm tra” pass mới nên upload bài làm.
            </div>
            <Button variant="outline" disabled={validating} onClick={validate}>
              {validating ? 'Đang kiểm tra…' : 'Kiểm tra đã đủ bài chưa'}
            </Button>
          </div>

          {validation ? (
            <div className="space-y-3">
              {validation.ok ? (
                <div className="p-3 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-100 text-sm">
                  OK — Có thể upload bài làm.
                </div>
              ) : (
                <div className="p-3 rounded border border-rose-500/30 bg-rose-500/10 text-rose-100 text-sm">
                  Không hợp lệ — cần sửa các lỗi dưới đây trước khi upload bài làm.
                </div>
              )}
              {Array.isArray(validation.warnings) && validation.warnings.length ? (
                <div className="p-3 rounded border border-amber-500/30 bg-amber-500/10 text-amber-100 text-sm">
                  <div className="font-semibold">Cảnh báo</div>
                  <div className="mt-2 space-y-1">
                    {validation.warnings.map((w: any, idx: number) => (
                      <div key={idx}>{w.message}</div>
                    ))}
                  </div>
                </div>
              ) : null}
              {Array.isArray(validation.errors) && validation.errors.length ? (
                <div className="p-3 rounded border border-rose-500/30 bg-rose-500/10 text-rose-100 text-sm">
                  <div className="font-semibold">Danh sách lỗi</div>
                  <div className="mt-2 space-y-1">
                    {validation.errors.slice(0, 50).map((e: any, idx: number) => (
                      <div key={idx}>
                        {e.paper_code ? `Mã đề ${e.paper_code}: ` : ''}{e.message}
                        {e.question_id ? <span style={{ color: 'rgba(255,255,255,0.6)' }}> ({String(e.question_id).slice(0, 8)}…)</span> : null}
                      </div>
                    ))}
                    {validation.errors.length > 50 ? (
                      <div style={{ color: 'rgba(255,255,255,0.6)' }}>… và {validation.errors.length - 50} lỗi khác</div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card id="students">
        <CardHeader>
          <CardTitle>Danh sách học sinh</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Upload file Excel (.xlsx). Cột tối thiểu: student_code/SBD, full_name, class_name.
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => {
              const f = e.target.files?.[0] || null
              setExcelFile(f)
              if (f) previewExcel(f)
              else setPreview(null)
            }}
          />
          {previewLoading ? <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Đang đọc file…</div> : null}

          {preview ? (
            <div className="space-y-3">
              {Array.isArray(preview.duplicates_in_file) && preview.duplicates_in_file.length ? (
                <div className="p-3 rounded border border-rose-500/30 bg-rose-500/10 text-rose-100 text-sm">
                  Trùng student_code trong file: {preview.duplicates_in_file.join(', ')}
                </div>
              ) : null}
              <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Preview: {Array.isArray(preview.items) ? preview.items.length : 0} dòng
              </div>
              <div className="border rounded overflow-auto" style={{ borderColor: 'var(--divider)' }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b" style={{ borderColor: 'var(--divider)' }}>
                      <th className="text-left p-2">student_code</th>
                      <th className="text-left p-2">full_name</th>
                      <th className="text-left p-2">class_name</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(preview.items || []).slice(0, 30).map((r: any, idx: number) => (
                      <tr key={idx} className="border-b" style={{ borderColor: 'var(--divider)' }}>
                        <td className="p-2">{r.student_code}</td>
                        <td className="p-2">{r.full_name}</td>
                        <td className="p-2">{r.class_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setPreview(null); setExcelFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}>
                  Hủy
                </Button>
                <Button disabled={importing || (preview.duplicates_in_file || []).length > 0} onClick={importStudents}>
                  {importing ? 'Đang lưu…' : 'Lưu danh sách'}
                </Button>
              </div>
            </div>
          ) : excelFile ? null : null}
        </CardContent>
      </Card>

      <Card id="upload">
        <CardHeader>
          <CardTitle>Upload bài làm</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Upload ảnh (JPG/PNG). Hệ thống sẽ nén ảnh trước khi lưu để tiết kiệm storage.
          </div>

          <input
            ref={sheetInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => {
              const fs = Array.from(e.target.files || [])
              setSheetFiles(fs)
            }}
          />
          <div className="flex justify-end gap-2 flex-wrap">
            <Button variant="outline" disabled={processing} onClick={processNext}>
              {processing ? 'Đang xử lý…' : 'Xử lý & Chấm (5 bài)'}
            </Button>
            <Button disabled={!sheetFiles.length || uploadingSheets} onClick={uploadSheets}>
              {uploadingSheets ? 'Đang upload…' : `Upload ${sheetFiles.length || 0} ảnh`}
            </Button>
          </div>

          {processResult ? (
            <div className="p-3 rounded border border-[var(--divider)] text-sm">
              <div className="font-semibold">Kết quả xử lý</div>
              <div className="mt-2 whitespace-pre-wrap" style={{ color: 'var(--text-muted)' }}>
                {JSON.stringify(processResult.processed || processResult, null, 2)}
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <div className="font-semibold">Danh sách bài làm gần đây</div>
            <Button variant="outline" size="sm" disabled={sheetsLoading} onClick={loadSheets}>
              {sheetsLoading ? 'Đang tải…' : 'Tải lại'}
            </Button>
          </div>
          {!sheets.length ? (
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Chưa có bài làm nào.</div>
          ) : (
            <div className="space-y-2">
              {sheets.map((s) => (
                <div key={s.id} className="border rounded p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2" style={{ borderColor: 'var(--divider)' }}>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">Sheet #{s.sheet_no ?? '—'}</div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      SBD: <span style={{ color: 'var(--text)' }}>{s.detected_student_code || '—'}</span>
                      {' '}· Mã đề: <span style={{ color: 'var(--text)' }}>{s.detected_paper_code || '—'}</span>
                      {' '}· {s.process_status || '—'}
                    </div>
                  </div>
                  <div className="flex gap-2 items-center flex-wrap">
                    {s.signed_url ? (
                      <a href={s.signed_url} target="_blank" rel="noreferrer" className="underline text-sm">
                        Xem ảnh
                      </a>
                    ) : null}
                    <span className="text-xs px-2 py-1 rounded border" style={{ borderColor: 'var(--divider)' }}>
                      {s.match_status || '—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card id="scores">
        <CardHeader>
          <CardTitle>Bảng điểm</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Dữ liệu lấy từ official_exam_attempts (backend).
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              <a href={`/api/teacher/official-exams/${examId}/scores/export`} className="underline text-sm">Xuất Excel (CSV)</a>
              <Button variant="outline" size="sm" disabled={scoresLoading} onClick={loadScores}>
                {scoresLoading ? 'Đang tải…' : 'Tải lại'}
              </Button>
            </div>
          </div>

          {!scores.length ? (
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Chưa có bài nào được chấm.</div>
          ) : (
            <div className="border rounded overflow-auto" style={{ borderColor: 'var(--divider)' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--divider)' }}>
                    <th className="text-left p-2">student_code</th>
                    <th className="text-left p-2">full_name</th>
                    <th className="text-left p-2">class</th>
                    <th className="text-left p-2">paper</th>
                    <th className="text-left p-2">lesson</th>
                    <th className="text-left p-2">score</th>
                    <th className="text-left p-2">đúng/sai/trống</th>
                    <th className="text-left p-2">action</th>
                  </tr>
                </thead>
                <tbody>
                  {scores.map((r) => (
                    <tr key={r.id} className="border-b" style={{ borderColor: 'var(--divider)' }}>
                      <td className="p-2">{r.student_code || '—'}</td>
                      <td className="p-2">{r.full_name || '—'}</td>
                      <td className="p-2">{r.class_name || '—'}</td>
                      <td className="p-2">{r.paper_code || '—'}</td>
                      <td className="p-2 whitespace-normal break-words">{r.lesson_title || '—'}</td>
                      <td className="p-2">{String(r.raw_score ?? '—')}/{String(r.total_score ?? '—')}</td>
                      <td className="p-2">{r.correct_count ?? 0}/{r.wrong_count ?? 0}/{r.blank_count ?? 0}</td>
                      <td className="p-2">
                        <Link href={`/teacher_dashboard/official_exams/${examId}/attempts/${r.id}`} prefetch={false} className="underline">
                          Xem
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
