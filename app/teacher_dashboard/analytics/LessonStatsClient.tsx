'use client'
import { useEffect, useMemo, useState } from 'react'

type LessonStat = {
  lesson_id: string
  lesson_title: string
  grade_name: string
  lesson_created_at: string | null
  total_attempts: number
  avg_score_percent: number
}

type SortKey = 'lesson_title' | 'total_attempts' | 'avg_score_percent' | 'lesson_created_at' | 'grade_name'

export default function LessonStatsClient() {
  const [rows, setRows] = useState<LessonStat[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [grade, setGrade] = useState<string>('all')
  const [days, setDays] = useState<string>('all')
  const [sortKey, setSortKey] = useState<SortKey>('total_attempts')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [search, setSearch] = useState('')
  const [schoolName, setSchoolName] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 30
  const [total, setTotal] = useState(0)

  useEffect(() => {
    setLoading(true)
    const qs = new URLSearchParams()
    if (days !== 'all') qs.set('days', days)
    if (grade !== 'all') qs.set('grade_name', grade)
    if (search.trim()) qs.set('search', search.trim())
    qs.set('sort_key', sortKey)
    qs.set('sort_dir', sortDir)
    qs.set('page', String(page))
    qs.set('page_size', String(pageSize))
    fetch(`/api/teacher/analytics/lessons?${qs.toString()}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load lesson stats')))
      .then(json => {
        setRows(json?.lessons || [])
        setTotal(json?.total || 0)
        setSchoolName(json?.school_name || '')
      })
      .catch(err => setError(err.message || 'Lỗi tải dữ liệu bài học'))
      .finally(() => setLoading(false))
  }, [grade, days, search, sortKey, sortDir, page])

  const gradesFromData = Array.from(new Set(rows.map(x => x.grade_name).filter(Boolean)))
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="space-y-4">
      <div className="text-sm" style={{color:'var(--text-muted)'}}>Trong phạm vi trường: <span className="font-medium">{schoolName || '—'}</span></div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <label className="text-sm">Khối</label>
          <select className="border rounded p-2 bg-transparent select-clean" value={grade} onChange={e => setGrade(e.target.value)}>
            <option value="all">Tất cả</option>
            {gradesFromData.map(g => <option key={g} value={g}>{g || 'Khối'}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm">Thời gian</label>
          <select className="border rounded p-2 bg-transparent select-clean" value={days} onChange={e => setDays(e.target.value)}>
            <option value="all">Tất cả</option>
            <option value="7">7 ngày</option>
            <option value="30">30 ngày</option>
            <option value="90">3 tháng</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm">Sort</label>
          <select className="border rounded p-2 bg-transparent select-clean" value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}>
            <option value="total_attempts">Số lần làm</option>
            <option value="lesson_title">Tên bài học</option>
            <option value="avg_score_percent">Điểm trung bình</option>
            <option value="lesson_created_at">Thời gian tạo</option>
            <option value="grade_name">Khối</option>
          </select>
          <select className="border rounded p-2 bg-transparent select-clean" value={sortDir} onChange={e => setSortDir(e.target.value as 'asc' | 'desc')}>
            <option value="desc">Giảm dần</option>
            <option value="asc">Tăng dần</option>
          </select>
        </div>
        <div className="flex-1 min-w-[220px]">
          <input
            className="w-full border rounded p-2 bg-transparent"
            placeholder="Tìm theo tên bài học..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>
      {error ? <div className="text-red-500 text-sm">{error}</div> : null}
      <div className="overflow-x-auto">
        <table className="w-full border rounded" style={{borderColor:'var(--divider)'}}>
          <thead>
            <tr>
              <th className="text-left p-2">Bài học</th>
              <th className="text-left p-2">Khối</th>
              <th className="text-left p-2">Số lần làm</th>
              <th className="text-left p-2">Điểm trung bình</th>
              <th className="text-left p-2">Thời gian tạo</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="p-3 text-sm" colSpan={5}>Đang tải...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="p-3 text-sm" style={{color:'var(--text-muted)'}} colSpan={5}>Chưa có dữ liệu bài học</td></tr>
            ) : rows.map(l => (
              <tr key={l.lesson_id}>
                <td className="p-2">{l.lesson_title}</td>
                <td className="p-2">{l.grade_name || '—'}</td>
                <td className="p-2">{l.total_attempts}</td>
                <td className="p-2">{l.avg_score_percent}%</td>
                <td className="p-2">{l.lesson_created_at ? new Date(l.lesson_created_at).toLocaleString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-end gap-2 mt-2">
          <div className="text-sm" style={{color:'var(--text-muted)'}}>Tổng {total} bài</div>
          <button className="border rounded px-3 py-2" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>Trang trước</button>
          <div className="text-sm">Trang {page}/{totalPages}</div>
          <button className="border rounded px-3 py-2" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Trang sau</button>
        </div>
      </div>
    </div>
  )
}
