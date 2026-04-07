'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { supabaseBrowser } from '@/lib/supabase/client'

type ExamCard = {
  id: string
  exam_title: string
  grade_id: string | null
  grade_name: string | null
  subject_name: string | null
  exam_date: string | null
  status: string | null
  papers_count: number
  students_count: number
  sheets_count: number
  graded_count: number
}

type GradeItem = { id: string, name: string }

export default function OfficialExamListClient() {
  const [items, setItems] = useState<ExamCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [examTitle, setExamTitle] = useState('')
  const [gradeId, setGradeId] = useState<string>('')
  const [subjectName, setSubjectName] = useState('Hóa học')
  const [academicYear, setAcademicYear] = useState('')
  const [examDate, setExamDate] = useState('')
  const [description, setDescription] = useState('')
  const [grades, setGrades] = useState<GradeItem[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const listRes = await fetch('/api/teacher/official-exams', { credentials: 'include' })
      const listJson = await listRes.json().catch(() => ({}))
      if (!listRes.ok) throw new Error(listJson.error || 'Không thể tải danh sách kì kiểm tra')
      setItems(Array.isArray(listJson.items) ? listJson.items : [])

      const { data: g } = await supabaseBrowser.from('grades').select('id,name').order('name', { ascending: true })
      const mapped: GradeItem[] = (g || []).map((x: any) => ({ id: String(x.id), name: String(x.name) }))
      setGrades(mapped.filter((x) => ['10', '11', '12'].includes(String(x.name))))
    } catch (e: any) {
      setError(e.message || 'Có lỗi xảy ra')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const canCreate = useMemo(() => {
    return !!examTitle.trim() && !!gradeId
  }, [examTitle, gradeId])

  const createExam = useCallback(async () => {
    if (!canCreate) return
    setCreating(true)
    setError('')
    try {
      const res = await fetch('/api/teacher/official-exams/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          exam_title: examTitle.trim(),
          grade_id: gradeId,
          subject_name: subjectName.trim(),
          academic_year: academicYear.trim(),
          exam_date: examDate || null,
          description: description.trim()
        })
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Tạo kì kiểm tra thất bại')
      setCreateOpen(false)
      setExamTitle('')
      setDescription('')
      await load()
    } catch (e: any) {
      setError(e.message || 'Có lỗi xảy ra')
    } finally {
      setCreating(false)
    }
  }, [academicYear, canCreate, description, examDate, examTitle, gradeId, load, subjectName])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Tạo kì kiểm tra offline và chấm bằng ChemAI (mỗi mã đề = 1 lesson)
        </div>
        <Button onClick={() => setCreateOpen(true)}>Tạo kì kiểm tra</Button>
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
                  <span className="whitespace-normal break-words">{e.exam_title}</span>
                  <span className="text-xs px-2 py-1 rounded border" style={{ borderColor: 'var(--divider)' }}>
                    {e.status || 'Draft'}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Khối: <span style={{ color: 'var(--text)' }}>{e.grade_name || '—'}</span>
                  {' '}· Môn: <span style={{ color: 'var(--text)' }}>{e.subject_name || '—'}</span>
                  {e.exam_date ? <> · Ngày thi: <span style={{ color: 'var(--text)' }}>{new Date(e.exam_date).toLocaleDateString()}</span></> : null}
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>Mã đề: <b>{e.papers_count}</b></div>
                  <div>Học sinh: <b>{e.students_count}</b></div>
                  <div>Bài làm: <b>{e.sheets_count}</b></div>
                  <div>Đã chấm: <b>{e.graded_count}</b></div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Link href={`/teacher_dashboard/official_exams/${e.id}`} prefetch={false}>
                    <Button variant="outline">Xem chi tiết</Button>
                  </Link>
                  <Link href={`/teacher_dashboard/official_exams/${e.id}#upload`} prefetch={false}>
                    <Button variant="outline">Upload bài làm</Button>
                  </Link>
                  <Link href={`/teacher_dashboard/official_exams/${e.id}#scores`} prefetch={false}>
                    <Button variant="outline">Xem bảng điểm</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {createOpen ? (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setCreateOpen(false)}>
          <div className="w-full max-w-xl rounded-lg border border-[var(--divider)] bg-slate-950 p-4 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <div className="text-lg font-semibold">Tạo kì kiểm tra</div>
              <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>Đóng</Button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <div className="text-sm">Tên kì kiểm tra</div>
                <Input value={examTitle} onChange={(e) => setExamTitle(e.target.value)} placeholder="Ví dụ: Thi thử HK2 - Khối 12" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="text-sm">Khối</div>
                  <select className="w-full border rounded px-3 py-2 text-sm bg-slate-950" style={{ borderColor: 'var(--divider)' }} value={gradeId} onChange={(e) => setGradeId(e.target.value)}>
                    <option value="">-- Chọn khối --</option>
                    {grades.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <div className="text-sm">Môn</div>
                  <Input value={subjectName} onChange={(e) => setSubjectName(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="text-sm">Năm học</div>
                  <Input value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} placeholder="Ví dụ: 2025-2026" />
                </div>
                <div className="space-y-1">
                  <div className="text-sm">Ngày thi</div>
                  <Input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-sm">Mô tả (không bắt buộc)</div>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ghi chú cho kì kiểm tra…" />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Hủy</Button>
              <Button disabled={!canCreate || creating} onClick={createExam}>
                {creating ? 'Đang tạo…' : 'Tạo'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
