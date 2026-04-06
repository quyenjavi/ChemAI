'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

type LessonStat = {
  lesson_id: string
  lesson_title: string
  grade_name: string
  lesson_created_at: string | null
  is_visible: boolean
  lesson_type: 'practice' | 'exam'
  is_teacher_recommended: boolean
  display_order: number | null
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
  const [page, setPage] = useState(1)
  const pageSize = 30
  const [total, setTotal] = useState(0)
  const [visibilityDraft, setVisibilityDraft] = useState<Record<string, boolean>>({})
  const [lessonTypeDraft, setLessonTypeDraft] = useState<Record<string, 'practice' | 'exam'>>({})
  const [recommendedDraft, setRecommendedDraft] = useState<Record<string, boolean>>({})
  const [displayOrderDraft, setDisplayOrderDraft] = useState<Record<string, string>>({})
  const [savingLessonId, setSavingLessonId] = useState<string | null>(null)
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null)

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
        const nextRows = json?.lessons || []
        setRows(nextRows)
        setTotal(json?.total || 0)
        setVisibilityDraft(prev => {
          const copy = { ...prev }
          for (const l of nextRows) {
            if (typeof copy[l.lesson_id] !== 'boolean') copy[l.lesson_id] = !!l.is_visible
          }
          return copy
        })
        setLessonTypeDraft(prev => {
          const copy = { ...prev }
          for (const l of nextRows) {
            const v = l.lesson_type === 'exam' ? 'exam' : 'practice'
            if (copy[l.lesson_id] !== 'exam' && copy[l.lesson_id] !== 'practice') copy[l.lesson_id] = v
          }
          return copy
        })
        setRecommendedDraft(prev => {
          const copy = { ...prev }
          for (const l of nextRows) {
            if (typeof copy[l.lesson_id] !== 'boolean') copy[l.lesson_id] = !!l.is_teacher_recommended
          }
          return copy
        })
        setDisplayOrderDraft(prev => {
          const copy = { ...prev }
          for (const l of nextRows) {
            if (typeof copy[l.lesson_id] !== 'string') copy[l.lesson_id] = (l.display_order == null ? '' : String(l.display_order))
          }
          return copy
        })
      })
      .catch(err => setError(err.message || 'Lỗi tải dữ liệu bài học'))
      .finally(() => setLoading(false))
  }, [grade, days, search, sortKey, sortDir, page])

  const gradesFromData = Array.from(new Set(rows.map(x => x.grade_name).filter(Boolean)))
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const editLesson = async (lessonId: string, currentTitle: string) => {
    const title = window.prompt('Nhập tên bài học mới:', currentTitle || '')
    if (!title) return
    setEditingLessonId(lessonId)
    setError('')
    try {
      const r = await fetch(`/api/teacher/lessons/${lessonId}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Không thể cập nhật bài học')
      setRows(prev => prev.map(x => x.lesson_id === lessonId ? { ...x, lesson_title: title } : x))
    } catch (e: any) {
      setError(e.message || 'Có lỗi xảy ra')
    } finally {
      setEditingLessonId(null)
    }
  }

  const deleteLesson = async (lessonId: string, currentTitle: string) => {
    const ok = window.confirm(`Xóa bài học "${currentTitle}"? (Xóa mềm: ẩn khỏi học sinh)`)
    if (!ok) return
    setEditingLessonId(lessonId)
    setError('')
    try {
      const r = await fetch(`/api/teacher/lessons/${lessonId}/delete`, { method: 'POST', credentials: 'include' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Không thể xóa bài học')
      setRows(prev => prev.map(x => x.lesson_id === lessonId ? { ...x, is_visible: false, lesson_title: x.lesson_title.startsWith('[Đã xóa]') ? x.lesson_title : `[Đã xóa] ${x.lesson_title}` } : x))
    } catch (e: any) {
      setError(e.message || 'Có lỗi xảy ra')
    } finally {
      setEditingLessonId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-sm" style={{color:'var(--text-muted)'}}>Phạm vi: <span className="font-medium">Toàn hệ thống</span></div>
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
              <th className="text-left p-2">Loại bài</th>
              <th className="text-left p-2">Đề cử</th>
              <th className="text-left p-2">Thứ tự hiển thị</th>
              <th className="text-left p-2">Số lần làm</th>
              <th className="text-left p-2">Điểm trung bình</th>
              <th className="text-left p-2">Thời gian tạo</th>
              <th className="text-left p-2">Hiển thị</th>
              <th className="text-left p-2">Sửa/Xóa</th>
              <th className="text-left p-2">Lưu</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="p-3 text-sm" colSpan={11}>Đang tải...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="p-3 text-sm" style={{color:'var(--text-muted)'}} colSpan={11}>Chưa có dữ liệu bài học</td></tr>
            ) : rows.map(l => (
              <tr key={l.lesson_id}>
                <td className="p-2">
                  <Link href={`/teacher_dashboard/analytics/lessons/${l.lesson_id}`} prefetch={false} className="underline">
                    {l.lesson_title}
                  </Link>
                </td>
                <td className="p-2">{l.grade_name || '—'}</td>
                <td className="p-2">
                  <div className="space-y-1">
                    <select
                      className="border rounded p-2 bg-transparent select-clean"
                      value={lessonTypeDraft[l.lesson_id] ?? l.lesson_type}
                      onChange={e => {
                        const next = e.target.value === 'exam' ? 'exam' : 'practice'
                        setLessonTypeDraft(prev => ({ ...prev, [l.lesson_id]: next }))
                      }}
                    >
                      <option value="practice">Luyện tập</option>
                      <option value="exam">Kiểm tra</option>
                    </select>
                    {(lessonTypeDraft[l.lesson_id] ?? l.lesson_type) === 'exam' ? (
                      <div className="text-xs" style={{color:'var(--text-muted)'}}>
                        Học sinh sẽ làm toàn bộ đề, kết quả hiển thị theo điểm.
                      </div>
                    ) : null}
                  </div>
                </td>
                <td className="p-2">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={recommendedDraft[l.lesson_id] ?? l.is_teacher_recommended}
                      onChange={e => setRecommendedDraft(prev => ({ ...prev, [l.lesson_id]: e.target.checked }))}
                    />
                    <span className="text-sm">Đề cử</span>
                  </label>
                </td>
                <td className="p-2">
                  <input
                    className="border rounded p-2 bg-transparent w-28"
                    type="number"
                    min={1}
                    step={1}
                    placeholder="(null)"
                    value={displayOrderDraft[l.lesson_id] ?? (l.display_order == null ? '' : String(l.display_order))}
                    onChange={e => setDisplayOrderDraft(prev => ({ ...prev, [l.lesson_id]: e.target.value }))}
                  />
                </td>
                <td className="p-2">{l.total_attempts}</td>
                <td className="p-2">{l.avg_score_percent}%</td>
                <td className="p-2">{l.lesson_created_at ? new Date(l.lesson_created_at).toLocaleString() : '—'}</td>
                <td className="p-2">
                  <select
                    className="border rounded p-2 bg-transparent select-clean"
                    value={(visibilityDraft[l.lesson_id] ?? l.is_visible) ? 'true' : 'false'}
                    onChange={e => {
                      const next = e.target.value === 'true'
                      setVisibilityDraft(prev => ({ ...prev, [l.lesson_id]: next }))
                    }}
                  >
                    <option value="true">Hiển thị</option>
                    <option value="false">Không hiển thị</option>
                  </select>
                </td>
                <td className="p-2">
                  <div className="flex items-center gap-2">
                    <button
                      className="border rounded px-3 py-2"
                      disabled={editingLessonId === l.lesson_id || savingLessonId === l.lesson_id}
                      onClick={() => editLesson(l.lesson_id, l.lesson_title)}
                    >
                      Sửa
                    </button>
                    <button
                      className="border rounded px-3 py-2"
                      disabled={editingLessonId === l.lesson_id || savingLessonId === l.lesson_id}
                      onClick={() => deleteLesson(l.lesson_id, l.lesson_title)}
                    >
                      Xóa
                    </button>
                  </div>
                </td>
                <td className="p-2">
                  <button
                    className="border rounded px-3 py-2"
                    disabled={savingLessonId === l.lesson_id}
                    onClick={() => {
                      const nextVisible = visibilityDraft[l.lesson_id] ?? l.is_visible
                      const nextType = lessonTypeDraft[l.lesson_id] ?? l.lesson_type
                      const nextRecommended = recommendedDraft[l.lesson_id] ?? l.is_teacher_recommended
                      const rawOrder = displayOrderDraft[l.lesson_id] ?? (l.display_order == null ? '' : String(l.display_order))
                      const nextOrder = rawOrder.trim() ? parseInt(rawOrder.trim(), 10) : null
                      setSavingLessonId(l.lesson_id)
                      setError('')
                      fetch('/api/teacher/lessons/visibility', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({
                          lesson_id: l.lesson_id,
                          is_visible: nextVisible,
                          lesson_type: nextType,
                          is_teacher_recommended: nextRecommended,
                          display_order: nextOrder
                        })
                      })
                        .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to save lesson visibility')))
                        .then(() => {
                          setRows(prev => prev.map(x => x.lesson_id === l.lesson_id ? {
                            ...x,
                            is_visible: nextVisible,
                            lesson_type: nextType,
                            is_teacher_recommended: nextRecommended,
                            display_order: nextOrder
                          } : x))
                        })
                        .catch(err => setError(err.message || 'Lỗi lưu trạng thái hiển thị'))
                        .finally(() => setSavingLessonId(null))
                    }}
                  >
                    {savingLessonId === l.lesson_id ? 'Đang lưu...' : 'Lưu'}
                  </button>
                </td>
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
