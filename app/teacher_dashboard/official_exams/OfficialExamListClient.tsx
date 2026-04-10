'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabaseBrowser } from '@/lib/supabase/client'

type ExamCard = {
  id: string
  title: string
  grade_id: string | null
  exam_date: string | null
  status: string | null
  papers_count: number
  students_count: number
  sheets_count: number
}

export default function OfficialExamListClient() {
  const [items, setItems] = useState<ExamCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [createTitle, setCreateTitle] = useState('')
  const [createGradeId, setCreateGradeId] = useState('')
  const [createExamDate, setCreateExamDate] = useState('')
  const [grades, setGrades] = useState<Array<{ id: string, name: string }>>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const listRes = await fetch('/api/teacher/official-exams', { credentials: 'include' })
      const listJson = await listRes.json().catch(() => ({}))
      if (!listRes.ok) throw new Error(listJson.error || 'Không thể tải danh sách kì kiểm tra')
      setItems(Array.isArray(listJson.items) ? listJson.items : [])
    } catch (e: any) {
      setError(e.message || 'Có lỗi xảy ra')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    supabaseBrowser
      .from('grades')
      .select('id,name')
      .order('name', { ascending: true })
      .then(({ data }) => {
        setGrades((data || []).map((g: any) => ({ id: String(g.id), name: String(g.name || '') })))
      })
  }, [])

  const createExam = useCallback(async () => {
    setCreateError('')
    if (!createTitle.trim()) { setCreateError('Thiếu tên kì kiểm tra'); return }
    if (!createGradeId) { setCreateError('Thiếu khối'); return }
    setCreating(true)
    try {
      const res = await fetch('/api/teacher/official-exams/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: createTitle.trim(),
          grade_id: createGradeId,
          exam_date: createExamDate || null
        })
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Không thể tạo kì kiểm tra')
      setCreateOpen(false)
      setCreateTitle('')
      setCreateGradeId('')
      setCreateExamDate('')
      await load()
    } catch (e: any) {
      setCreateError(e.message || 'Có lỗi xảy ra')
    } finally {
      setCreating(false)
    }
  }, [createExamDate, createGradeId, createTitle, load])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Chọn kì kiểm tra đã import sẵn từ hệ thống chấm tại trường để merge kết quả và xuất bảng điểm
        </div>
        <Button variant="outline" onClick={() => { setCreateOpen(true); setCreateError('') }}>
          Tạo kì thi
        </Button>
      </div>

      {loading ? <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Đang tải…</div> : null}
      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      {!loading && !items.length ? (
        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Chưa có kì kiểm tra nào.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((e) => (
            <Card key={e.id}>
              <CardHeader>
                <CardTitle className="flex items-start justify-between gap-3">
                  <span className="whitespace-normal break-words">{e.title}</span>
                  <span className="text-xs px-2 py-1 rounded border" style={{ borderColor: 'var(--divider)' }}>
                    {e.status || 'Draft'}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Khối: <span style={{ color: 'var(--text)' }}>{e.grade_id || '—'}</span>
                  {e.exam_date ? <> · Ngày thi: <span style={{ color: 'var(--text)' }}>{new Date(e.exam_date).toLocaleDateString()}</span></> : null}
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>Mã đề: <b>{e.papers_count}</b></div>
                  <div>Học sinh: <b>{e.students_count}</b></div>
                  <div>Bài làm: <b>{e.sheets_count}</b></div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Link href={`/teacher_dashboard/official_exams/${e.id}`} prefetch={false}>
                    <Button variant="outline">Xem chi tiết</Button>
                  </Link>
                  <Link href={`/teacher_dashboard/official_exams/${e.id}#merge`} prefetch={false}>
                    <Button variant="outline">Merge</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {createOpen ? (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setCreateOpen(false)}>
          <div className="w-full max-w-lg rounded-lg border border-[var(--divider)] bg-slate-950 p-4 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <div className="text-lg font-semibold">Tạo kì thi (Official Exam)</div>
              <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>Đóng</Button>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="text-sm">Tên kì thi</div>
                <Input value={createTitle} onChange={(e) => setCreateTitle(e.target.value)} placeholder="VD: Thi thử HK2 - Khối 12" />
              </div>
              <div className="space-y-1">
                <div className="text-sm">Khối (grade)</div>
                <select className="w-full border rounded px-3 py-2 text-sm bg-slate-950" style={{ borderColor: 'var(--divider)' }} value={createGradeId} onChange={(e) => setCreateGradeId(e.target.value)}>
                  <option value="">-- Chọn khối --</option>
                  {grades.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <div className="text-sm">Ngày thi (tuỳ chọn)</div>
                <Input type="date" value={createExamDate} onChange={(e) => setCreateExamDate(e.target.value)} />
              </div>
              {createError ? <div className="text-sm text-red-600">{createError}</div> : null}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Hủy</Button>
              <Button disabled={creating} onClick={createExam}>
                {creating ? 'Đang tạo…' : 'Tạo'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
