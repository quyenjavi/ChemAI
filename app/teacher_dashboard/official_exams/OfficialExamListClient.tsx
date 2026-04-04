'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type ExamListItem = {
  id: string
  title: string
  subject: string | null
  status: string | null
  exam_date: string | null
  total_papers: number | null
  total_students: number | null
  total_sheets: number | null
  total_graded: number | null
  created_at: string
  school?: { id: string, name: string } | null
  grade?: { id: string, name: string } | null
  academic_year?: { id: string, name: string } | null
}

type Grade = { id: string, name: string }
type AcademicYear = { id: string, name: string }

type MetaResponse = {
  grades: Grade[]
  academic_years: AcademicYear[]
}

export default function OfficialExamListClient() {
  const [meta, setMeta] = useState<MetaResponse | null>(null)
  const [items, setItems] = useState<ExamListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [status, setStatus] = useState<string>('')
  const [gradeId, setGradeId] = useState<string>('')
  const [academicYearId, setAcademicYearId] = useState<string>('')
  const [q, setQ] = useState('')

  useEffect(() => {
    fetch('/api/teacher/official-exams/meta', { credentials: 'include' })
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!ok) return
        setMeta({
          grades: Array.isArray(j.grades) ? j.grades : [],
          academic_years: Array.isArray(j.academic_years) ? j.academic_years : [],
        })
      })
      .catch(() => {})
  }, [])

  const qs = useMemo(() => {
    const params = new URLSearchParams()
    if (status) params.set('status', status)
    if (gradeId) params.set('grade_id', gradeId)
    if (academicYearId) params.set('academic_year_id', academicYearId)
    if (q.trim()) params.set('q', q.trim())
    const s = params.toString()
    return s ? `?${s}` : ''
  }, [status, gradeId, academicYearId, q])

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError('')
    fetch(`/api/teacher/official-exams/list${qs}`, { credentials: 'include' })
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!mounted) return
        if (!ok) {
          setError(j.error || 'Không thể tải danh sách official exams')
          setItems([])
          return
        }
        setItems(Array.isArray(j.items) ? j.items : [])
      })
      .catch(e => {
        if (!mounted) return
        setError(e.message || 'Lỗi tải dữ liệu')
        setItems([])
      })
      .finally(() => {
        if (!mounted) return
        setLoading(false)
      })
    return () => { mounted = false }
  }, [qs])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Official Exams</h1>
        <Link href="/teacher_dashboard/official_exams/create" prefetch={false}>
          <Button>Tạo Official Exam</Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bộ lọc</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="text-sm">Trạng thái</label>
              <select
                className="w-full mt-1 border rounded p-2 bg-transparent select-clean"
                value={status}
                onChange={e => setStatus(e.target.value)}
              >
                <option value="">Tất cả</option>
                <option value="draft">draft</option>
                <option value="ready">ready</option>
                <option value="graded">graded</option>
              </select>
            </div>
            <div>
              <label className="text-sm">Khối</label>
              <select
                className="w-full mt-1 border rounded p-2 bg-transparent select-clean"
                value={gradeId}
                onChange={e => setGradeId(e.target.value)}
              >
                <option value="">Tất cả</option>
                {(meta?.grades || []).map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm">Năm học</label>
              <select
                className="w-full mt-1 border rounded p-2 bg-transparent select-clean"
                value={academicYearId}
                onChange={e => setAcademicYearId(e.target.value)}
              >
                <option value="">Tất cả</option>
                {(meta?.academic_years || []).map(ay => (
                  <option key={ay.id} value={ay.id}>{ay.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm">Tìm theo tiêu đề</label>
              <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Nhập tiêu đề..." />
            </div>
          </div>
        </CardContent>
      </Card>

      {error ? <div className="text-red-500 text-sm">{error}</div> : null}

      <div className="space-y-3">
        {loading ? (
          <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Đang tải...</div>
        ) : items.length === 0 ? (
          <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Chưa có official exam nào</div>
        ) : (
          items.map(it => (
            <Card key={it.id}>
              <CardContent className="p-5 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{it.title}</div>
                    <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      {it.school?.name ? `${it.school.name} • ` : ''}{it.grade?.name ? `Khối ${it.grade.name} • ` : ''}{it.academic_year?.name || ''}
                    </div>
                    <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      {it.subject ? `Môn: ${it.subject} • ` : ''}{it.exam_date ? `Ngày thi: ${new Date(it.exam_date).toLocaleDateString()}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-xs px-2 py-1 rounded border" style={{ borderColor: 'var(--divider)' }}>
                      {it.status || '—'}
                    </div>
                    <Link href={`/teacher_dashboard/official_exams/${it.id}`} prefetch={false}>
                      <Button variant="outline" className="h-8 px-3 text-sm">Mở</Button>
                    </Link>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                  <div>Papers: {it.total_papers ?? 0}</div>
                  <div>Students: {it.total_students ?? 0}</div>
                  <div>Sheets: {it.total_sheets ?? 0}</div>
                  <div>Đã chấm: {it.total_graded ?? 0}</div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
