'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

type Grade = { id: string, name: string }
type AcademicYear = { id: string, name: string }
type TeacherMeta = {
  city: { id: string, name: string }
  school: { id: string, name: string }
}

type MetaResponse = {
  teacher: TeacherMeta
  grades: Grade[]
  academic_years: AcademicYear[]
}

function computeAcademicYearLabel(d: Date) {
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const day = d.getDate()
  if (m > 7 || (m === 7 && day >= 1)) return `${y}-${y + 1}`
  return `${y - 1}-${y}`
}

export default function CreateOfficialExamClient() {
  const router = useRouter()
  const [meta, setMeta] = useState<MetaResponse | null>(null)

  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('Hóa học')
  const [semester, setSemester] = useState<'ky_1' | 'ky_2' | 'on_thi_dai_hoc'>('ky_1')
  const [durationMinutes, setDurationMinutes] = useState<number>(45)
  const [description, setDescription] = useState('')
  const [examDate, setExamDate] = useState<string>('')

  const [gradeId, setGradeId] = useState<string>('')
  const [academicYearId, setAcademicYearId] = useState<string>('')

  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    setLoading(true)
    fetch('/api/teacher/official-exams/meta', { credentials: 'include' })
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!mounted) return
        if (!ok) {
          setError(j.error || 'Không thể tải dữ liệu teacher')
          setMeta(null)
          return
        }
        setError('')
        setMeta(j)
        const defaultGradeId = String(j?.grades?.[0]?.id || '')
        if (defaultGradeId) setGradeId(defaultGradeId)
        const label = computeAcademicYearLabel(new Date())
        const ay = (j?.academic_years || []).find((x: any) => String(x?.name || '') === label)
        const ayId = String(ay?.id || j?.academic_years?.[0]?.id || '')
        if (ayId) setAcademicYearId(ayId)
      })
      .catch(e => {
        if (!mounted) return
        setError(e.message || 'Lỗi tải dữ liệu')
        setMeta(null)
      })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  const formOk = useMemo(() => {
    return !!(
      title.trim() &&
      subject.trim() &&
      gradeId &&
      academicYearId &&
      meta?.teacher?.city?.id &&
      meta?.teacher?.school?.id &&
      durationMinutes > 0 &&
      !creating
    )
  }, [title, subject, meta, gradeId, academicYearId, durationMinutes, creating])

  const create = async () => {
    if (!formOk) return
    setCreating(true)
    setError('')
    const payload = {
      title,
      subject,
      grade_id: gradeId,
      academic_year_id: academicYearId,
      exam_date: examDate ? new Date(examDate).toISOString() : null,
      semester,
      duration_minutes: durationMinutes,
      description,
    }
    const r = await fetch('/api/teacher/official-exams/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    })
    const j = await r.json().catch(() => ({}))
    setCreating(false)
    if (!r.ok) {
      setError(j.error || 'Tạo official exam thất bại')
      return
    }
    router.push(`/teacher_dashboard/official_exams/${j.exam_id}`)
  }

  if (loading) return <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Đang tải...</div>

  const cityName = meta?.teacher?.city?.name || ''
  const schoolName = meta?.teacher?.school?.name || ''

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Tạo Official Exam</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Thông tin đề thi</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm">Tiêu đề</label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="VD: Thi GK2 Hóa 10 (Official)" />
            </div>
            <div>
              <label className="text-sm">Môn</label>
              <Input value={subject} onChange={e => setSubject(e.target.value)} />
            </div>
            <div>
              <label className="text-sm">Thành phố</label>
              <Input value={cityName} readOnly />
            </div>
            <div>
              <label className="text-sm">Trường</label>
              <Input value={schoolName} readOnly />
            </div>
            <div>
              <label className="text-sm">Khối</label>
              <select
                className="w-full mt-1 border rounded p-2 bg-transparent select-clean"
                value={gradeId}
                onChange={e => setGradeId(e.target.value)}
              >
                <option value="">Chọn khối</option>
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
                <option value="">Chọn năm học</option>
                {(meta?.academic_years || []).map(ay => (
                  <option key={ay.id} value={ay.id}>{ay.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm">Ngày thi</label>
              <Input value={examDate} onChange={e => setExamDate(e.target.value)} type="date" />
            </div>
            <div>
              <label className="text-sm">Học kì</label>
              <select
                className="w-full mt-1 border rounded p-2 bg-transparent select-clean"
                value={semester}
                onChange={e => setSemester(e.target.value as any)}
              >
                <option value="ky_1">Kì 1</option>
                <option value="ky_2">Kì 2</option>
                <option value="on_thi_dai_hoc">Ôn thi đại học</option>
              </select>
            </div>
            <div>
              <label className="text-sm">Thời lượng (phút)</label>
              <Input value={String(durationMinutes)} onChange={e => setDurationMinutes(parseInt(e.target.value || '0', 10) || 0)} />
            </div>
          </div>

          <div>
            <label className="text-sm">Mô tả</label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Ghi chú nội bộ..." />
          </div>

          {error ? <div className="text-red-500 text-sm">{error}</div> : null}

          <div className="flex items-center justify-end gap-2">
            <Button onClick={create} disabled={!formOk}>
              {creating ? 'Đang tạo...' : 'Tạo Official Exam'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
