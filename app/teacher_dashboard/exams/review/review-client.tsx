'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type ExamRow = {
  id: string
  title: string
  description: string | null
  status: string
  created_at: string
  updated_at: string
}

type MatrixExamRow = {
  id: string
  title: string
  is_published: boolean
  created_at: string
  total_questions: number
  total_score: number
  published_lesson_id?: string | null
  published_at?: string | null
}

export default function ReviewSavedExamsClient() {
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [exams, setExams] = useState<ExamRow[]>([])
  const [matrixExams, setMatrixExams] = useState<MatrixExamRow[]>([])
  const [matrixPublished, setMatrixPublished] = useState<MatrixExamRow[]>([])
  const [publishingId, setPublishingId] = useState<string | null>(null)
  const [matrixPublishingId, setMatrixPublishingId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setErr('')
    const r = await fetch('/api/teacher/exams/saved', { credentials: 'include' })
    const j = await r.json().catch(() => ({}))
    setLoading(false)
    if (!r.ok) { setErr(j.error || 'Không thể tải danh sách'); return }
    setExams(Array.isArray(j.exams) ? j.exams : [])
    setMatrixExams(Array.isArray(j.matrix_exams) ? j.matrix_exams : [])
    setMatrixPublished(Array.isArray(j.matrix_published) ? j.matrix_published : [])
  }

  useEffect(() => {
    load()
  }, [])

  const publish = async (id: string) => {
    const ok = window.confirm('Publish đề này để tạo bài EXAM cho học sinh?')
    if (!ok) return
    setPublishingId(id)
    setErr('')
    const r = await fetch(`/api/teacher/exams/${id}/publish`, { method: 'POST', credentials: 'include' })
    const j = await r.json().catch(() => ({}))
    setPublishingId(null)
    if (!r.ok) { setErr(j.error || 'Publish thất bại'); return }
    setExams(prev => prev.filter(e => e.id !== id))
  }

  const publishMatrix = async (id: string) => {
    const ok = window.confirm('Publish đề ma trận này? (Không xoá, lưu để tái sử dụng)')
    if (!ok) return
    setMatrixPublishingId(id)
    setErr('')
    const r = await fetch(`/api/teacher/matrix-exams/${id}/publish`, { method: 'POST', credentials: 'include' })
    const j = await r.json().catch(() => ({}))
    setMatrixPublishingId(null)
    if (!r.ok) { setErr(j.error || 'Publish thất bại'); return }
    setMatrixExams(prev => prev.filter(e => e.id !== id))
    await load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Xử lí đề mới tạo</h1>
        <Link href="/teacher_dashboard" className="underline" style={{color:'var(--gold)'}}>Quay lại</Link>
      </div>

      {err ? <div className="p-3 rounded border border-rose-500/30 bg-rose-500/10 text-rose-100">{err}</div> : null}

      <Card className="border" style={{borderColor:'var(--divider)'}}>
        <CardHeader><CardTitle>Đề đã lưu (saved)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {loading ? <div>Đang tải...</div> : null}
          {!loading && !exams.length ? <div className="text-sm" style={{color:'var(--text-muted)'}}>Không có đề nào cần xử lí.</div> : null}
          {exams.map(ex => (
            <div key={ex.id} className="rounded-md border border-slate-700/60 bg-slate-900/30 p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-sm font-semibold">{ex.title}</div>
                  {ex.description ? <div className="text-sm" style={{color:'var(--text-muted)'}}>{ex.description}</div> : null}
                  <div className="text-xs" style={{color:'var(--text-muted)'}}>Status: {ex.status}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Link href={`/teacher_dashboard/exams/${ex.id}`} className="underline" style={{color:'var(--gold)'}}>Mở</Link>
                  <Button variant="outline" onClick={() => publish(ex.id)} disabled={publishingId === ex.id}>
                    {publishingId === ex.id ? 'Đang publish...' : 'Publish'}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border" style={{borderColor:'var(--divider)'}}>
        <CardHeader><CardTitle>Đề ma trận (draft)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {loading ? <div>Đang tải...</div> : null}
          {!loading && !matrixExams.length ? <div className="text-sm" style={{color:'var(--text-muted)'}}>Không có đề ma trận nào cần xử lí.</div> : null}
          {matrixExams.map(ex => (
            <div key={ex.id} className="rounded-md border border-slate-700/60 bg-slate-900/30 p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-sm font-semibold">{ex.title}</div>
                  <div className="text-xs" style={{color:'var(--text-muted)'}}>Tổng: {Number(ex.total_questions || 0)} câu · {Number(ex.total_score || 0)} điểm</div>
                </div>
                <div className="flex items-center gap-2">
                  <Link href={`/teacher_dashboard/matrix_exams/${ex.id}`} className="underline" style={{color:'var(--gold)'}}>Mở</Link>
                  <Button variant="outline" onClick={() => publishMatrix(ex.id)} disabled={matrixPublishingId === ex.id}>
                    {matrixPublishingId === ex.id ? 'Đang publish...' : 'Publish'}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border" style={{borderColor:'var(--divider)'}}>
        <CardHeader><CardTitle>Đề ma trận đã publish</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {loading ? <div>Đang tải...</div> : null}
          {!loading && !matrixPublished.length ? <div className="text-sm" style={{color:'var(--text-muted)'}}>Chưa có đề ma trận nào đã publish.</div> : null}
          {matrixPublished.map(ex => (
            <div key={ex.id} className="rounded-md border border-slate-700/60 bg-slate-900/30 p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-sm font-semibold">{ex.title}</div>
                  <div className="text-xs" style={{color:'var(--text-muted)'}}>Tổng: {Number(ex.total_questions || 0)} câu · {Number(ex.total_score || 0)} điểm</div>
                  <div className="text-xs" style={{color:'var(--text-muted)'}}>Lesson ID: {ex.published_lesson_id || '—'}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Link href={`/teacher_dashboard/matrix_exams/${ex.id}`} className="underline" style={{color:'var(--gold)'}}>Mở</Link>
                  <Link href="/teacher_dashboard/analytics" className="underline" style={{color:'var(--gold)'}}>Quản lí bài học</Link>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
