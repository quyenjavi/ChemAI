'use client'
import { useEffect, useMemo, useState } from 'react'

type QuestionRow = {
  question_id: string
  lesson_id: string
  question_content: string
  question_type: string
  correct_key?: string
  correct_text?: string
  lesson_title: string
  grade_name: string
  total_attempts: number
  correct_rate: number
  created_at: string | null
  difficulty: string
  topic: string
  options: { key: string, text: string, is_correct: boolean, order: number }[]
  explanation: string
}

type SortKey = 'total_attempts' | 'correct_rate' | 'created_at' | 'grade_name' | 'lesson_title'

export default function QuestionsClient() {
  const [rows, setRows] = useState<QuestionRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [grade, setGrade] = useState<string>('all')
  const [lesson, setLesson] = useState<string>('all')
  const [type, setType] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('total_attempts')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [schoolName, setSchoolName] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [total, setTotal] = useState(0)
  const [detail, setDetail] = useState<QuestionRow | null>(null)
  const [detailIndex, setDetailIndex] = useState<number | null>(null)
  const [gradesMeta, setGradesMeta] = useState<string[]>([])
  const [lessonsMeta, setLessonsMeta] = useState<{ id: string, title: string, grade_id?: string, grade_name?: string }[]>([])

  useEffect(() => {
    fetch('/api/teacher/questions/meta', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load meta')))
      .then(json => {
        setGradesMeta(json?.grades || [])
        setLessonsMeta(json?.lessons || [])
        setSchoolName(json?.school_name || '')
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    const qs = new URLSearchParams()
    qs.set('page', String(page))
    qs.set('page_size', String(pageSize))
    qs.set('sort_key', sortKey)
    qs.set('sort_dir', sortDir)
    if (grade !== 'all') qs.set('grade_name', grade)
    if (lesson !== 'all') qs.set('lesson_id', lesson)
    if (type !== 'all') qs.set('question_type', type)
    if (search.trim()) qs.set('search', search.trim())
    fetch(`/api/teacher/questions?${qs.toString()}`, { credentials: 'include', cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load questions')))
      .then(json => {
        setRows(json?.questions || [])
        setTotal(json?.total || 0)
        setSchoolName(json?.school_name || '')
      })
      .catch(err => setError(err.message || 'Lỗi tải dữ liệu câu hỏi'))
      .finally(() => setLoading(false))
  }, [page, sortKey, sortDir, grade, lesson, type, search])

  const lessonsFromData = lessonsMeta
  const gradesFromData = gradesMeta
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="space-y-4">
      <style jsx>{`
        .question-cell {
          max-width: 600px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .badge {
          background: #1e293b;
          border-radius: 6px;
          padding: 2px 8px;
          font-size: 12px;
          display: inline-block;
        }
        table thead th {
          position: sticky;
          top: 0;
          background: var(--background);
          z-index: 1;
        }
        table tbody tr:hover {
          background: #1e293b;
        }
      `}</style>
      <div className="text-sm" style={{color:'var(--text-muted)'}}>Phạm vi: <span className="font-medium">Toàn hệ thống</span></div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <label className="text-sm">Khối</label>
          <select className="border rounded p-2 bg-transparent select-clean" value={grade} onChange={e => { setPage(1); setGrade(e.target.value) }}>
            <option value="all">Tất cả</option>
            {gradesFromData.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm">Bài học</label>
          <select className="border rounded p-2 bg-transparent select-clean" value={lesson} onChange={e => { setPage(1); setLesson(e.target.value) }} disabled={grade === 'all'}>
            <option value="all">Tất cả</option>
            {lessonsFromData.filter(l => grade === 'all' ? true : (l.grade_name === grade)).map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm">Loại</label>
          <select className="border rounded p-2 bg-transparent select-clean" value={type} onChange={e => { setPage(1); setType(e.target.value) }}>
            <option value="all">Tất cả</option>
            <option value="single_choice">Single choice</option>
            <option value="true_false">True/False</option>
            <option value="short_answer">Short answer</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm">Sort</label>
          <select className="border rounded p-2 bg-transparent select-clean" value={sortKey} onChange={e => { setPage(1); setSortKey(e.target.value as SortKey) }}>
            <option value="total_attempts">Số lần làm</option>
            <option value="correct_rate">Tỉ lệ đúng</option>
            <option value="created_at">Thời gian tạo</option>
            <option value="grade_name">Khối</option>
            <option value="lesson_title">Bài học</option>
          </select>
          <select className="border rounded p-2 bg-transparent select-clean" value={sortDir} onChange={e => { setPage(1); setSortDir(e.target.value as 'asc' | 'desc') }}>
            <option value="desc">Giảm dần</option>
            <option value="asc">Tăng dần</option>
          </select>
        </div>
        <div className="flex-1 min-w-[220px]">
          <input
            className="w-full border rounded p-2 bg-transparent"
            placeholder="Tìm theo nội dung câu hỏi..."
            value={search}
            onChange={e => { setPage(1); setSearch(e.target.value) }}
          />
        </div>
      </div>
      {error ? <div className="text-red-500 text-sm">{error}</div> : null}
      <div className="overflow-x-auto">
        <table className="w-full border rounded" style={{borderColor:'var(--divider)'}}>
          <colgroup>
            <col style={{width:'7%'}} />
            <col style={{width:'23%'}} />
            <col style={{width:'15%'}} />
            <col style={{width:'8%'}} />
            <col style={{width:'10%'}} />
            <col style={{width:'10%'}} />
            <col style={{width:'10%'}} />
            <col style={{width:'7%'}} />
          </colgroup>
          <thead>
            <tr>
              <th className="text-left p-2">#</th>
              <th className="text-left p-2">Câu hỏi</th>
              <th className="text-left p-2">Bài học</th>
              <th className="text-left p-2">Khối</th>
              <th className="text-left p-2">Loại</th>
              <th className="text-left p-2">Số lần làm</th>
              <th className="text-left p-2">Tỉ lệ đúng</th>
              <th className="text-left p-2">Thời gian tạo</th>
              <th className="text-left p-2">Hành động</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="p-3 text-sm" colSpan={9}>Đang tải...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="p-3 text-sm" style={{color:'var(--text-muted)'}} colSpan={9}>Chưa có câu hỏi nào được làm</td></tr>
            ) : rows.map((q, idx) => {
              const rank = (page - 1) * pageSize + idx + 1
              const rate = Number(q.correct_rate || 0)
              let rateColor = '#16a34a'
              if (rate < 40) { rateColor = '#ef4444' }
              else if (rate < 70) { rateColor = '#f59e0b' }
              else { rateColor = '#22c55e' }
              const createdLabel = (q as any).question_created_at ? new Date((q as any).question_created_at).toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit', year:'numeric' }) : '—'
              const typeLabel = q.question_type === 'single_choice' ? 'Trắc nghiệm' : (q.question_type === 'true_false' ? 'Đúng/Sai' : (q.question_type === 'short_answer' ? 'Tự luận' : (q.question_type || '—')))
              return (
              <tr key={q.question_id}>
                <td className="p-2">{rank}</td>
                <td className="p-2">
                  <div className="question-cell">{q.question_content || '—'}</div>
                </td>
                <td className="p-2"><span className="badge">{q.lesson_title || '—'}</span></td>
                <td className="p-2"><span className="badge">{q.grade_name ? `Khối ${q.grade_name}` : '—'}</span></td>
                <td className="p-2"><span className="badge">{typeLabel}</span></td>
                <td className="p-2">{Number.isFinite(Number(q.total_attempts)) ? Number(q.total_attempts) : 0}</td>
                <td className="p-2" style={{color: rateColor}}>{Number.isFinite(rate) ? rate.toFixed(2) : '0.00'}%</td>
                <td className="p-2">{createdLabel}</td>
                <td className="p-2">
                  <button className="border rounded px-2 py-1 text-sm" onClick={() => { setDetail(q); setDetailIndex(rank - 1) }}>👁 Xem</button>
                </td>
              </tr>
            )})}
          </tbody>
        </table>
        <div className="flex items-center justify-end gap-2 mt-2">
          <div className="text-sm" style={{color:'var(--text-muted)'}}>Tổng {total} câu</div>
          <button className="border rounded px-3 py-2" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>Trang trước</button>
          <div className="text-sm">Trang {page}/{totalPages}</div>
          <button className="border rounded px-3 py-2" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Trang sau</button>
        </div>
      </div>
      {detail ? (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setDetail(null)}>
          <div className="rounded shadow w-[800px] max-w-[92%]" onClick={e => e.stopPropagation()} style={{background:'#1e293b', color:'#ffffff'}}>
            <div className="flex items-center justify-between px-4 py-3" style={{background:'#2563eb'}}>
              <h3 className="text-lg font-semibold">Chi tiết câu hỏi</h3>
              <button aria-label="Đóng" className="rounded p-1 text-sm" onClick={() => { setDetail(null); setDetailIndex(null) }} style={{background:'transparent', color:'#ffffff'}}>✕</button>
            </div>
            <div className="px-4 py-4 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="font-medium">Bài học:</span> <span className="inline-block px-2 py-1 rounded" style={{background:'#0f172a'}}>{detail.lesson_title || '—'}</span></div>
                <div><span className="font-medium">Khối:</span> <span className="inline-block px-2 py-1 rounded" style={{background:'#0f172a'}}>{detail.grade_name ? `Khối ${detail.grade_name}` : '—'}</span></div>
                <div><span className="font-medium">Loại:</span> <span className="inline-block px-2 py-1 rounded" style={{background:'#0f172a'}}>{detail.question_type || '—'}</span></div>
                <div><span className="font-medium">Độ khó:</span> <span className="inline-block px-2 py-1 rounded" style={{background:'#0f172a'}}>{detail.difficulty || '—'}</span></div>
                <div><span className="font-medium">Chủ đề:</span> <span className="inline-block px-2 py-1 rounded" style={{background:'#0f172a'}}>{detail.topic || '—'}</span></div>
                <div><span className="font-medium">Attempts:</span> <span className="inline-block px-2 py-1 rounded" style={{background:'#0f172a'}}>{detail.total_attempts}</span></div>
                <div className="col-span-2">
                  <div className="font-medium mb-1">Correct rate</div>
                  <div className="w-full h-2 rounded" style={{background:'#0f172a'}}>
                    <div className="h-2 rounded" style={{width:`${Math.min(100, Math.max(0, detail.correct_rate || 0))}%`, background:'#22c55e'}} />
                  </div>
                  <div className="mt-1">{detail.correct_rate ?? 0}%</div>
                </div>
              </div>
            </div>
            <div className="px-4">
              <div className="font-medium mb-1">Nội dung câu hỏi</div>
              <div className="whitespace-pre-wrap rounded p-4" style={{background:'#0f172a'}}>{detail.question_content || '—'}</div>
            </div>
            {detail.question_type === 'true_false' ? (
              <div className="px-4 mt-3">
                <div className="font-medium mb-1">Các lựa chọn</div>
                <ul className="space-y-1 text-sm">
                  {(() => {
                    const k = (detail.correct_key || '').toUpperCase()
                    const isA = k === 'A'
                    const isB = k === 'B'
                    return (
                      <>
                        <li><span className="font-medium">A.</span> Đúng {isA ? <span style={{color:'#22c55e'}}>✔</span> : null}</li>
                        <li><span className="font-medium">B.</span> Sai {isB ? <span style={{color:'#22c55e'}}>✔</span> : null}</li>
                      </>
                    )
                  })()}
                </ul>
              </div>
            ) : detail.question_type !== 'short_answer' ? (
              <div className="px-4 mt-3">
                <div className="font-medium mb-1">Các lựa chọn</div>
                <ul className="space-y-1 text-sm">
                  {detail.options?.length ? detail.options.map(op => (
                    <li key={op.key}>
                      <span className="font-medium">{op.key}.</span> {op.text} {op.is_correct ? <span style={{color:'#22c55e'}}>✔</span> : null}
                    </li>
                  )) : <li className="text-sm" style={{color:'var(--text-muted)'}}>Không có lựa chọn</li>}
                </ul>
              </div>
            ) : null}
            <div className="px-4 mt-3">
              <div className="font-medium mb-1">💡 Lời giải</div>
              <div className="whitespace-pre-wrap rounded p-4" style={{background:'#0f172a'}}>
                {(detail.question_type === 'true_false' || detail.question_type === 'single_choice') ? '—' : (detail.explanation || '—')}
              </div>
            </div>
            {detail.question_type === 'short_answer' ? (
              <div className="px-4 mt-3">
                <div className="font-medium mb-1">Đáp án</div>
                <div className="whitespace-pre-wrap rounded p-4" style={{background:'#0f172a'}}>{detail.correct_text || '—'}</div>
              </div>
            ) : null}
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="text-sm" style={{color:'var(--text-muted)'}}>
                {(() => {
                  const r = detail.correct_rate || 0
                  if (r < 30) return 'Độ khó thực tế: 🔴 Hard'
                  if (r < 60) return 'Độ khó thực tế: 🟡 Medium'
                  return 'Độ khó thực tế: 🟢 Easy'
                })()}
              </div>
              <div className="flex items-center gap-2">
                <button className="border rounded px-2 py-1 text-sm" onClick={() => {
                  if (detailIndex == null) return
                  const prev = Math.max(0, detailIndex - 1)
                  const nextRow = rows[prev]
                  if (nextRow) { setDetail(nextRow); setDetailIndex(prev) }
                }}>{'← Câu trước'}</button>
                <button className="border rounded px-2 py-1 text-sm" onClick={() => {
                  if (detailIndex == null) return
                  const next = Math.min(rows.length - 1, detailIndex + 1)
                  const nextRow = rows[next]
                  if (nextRow) { setDetail(nextRow); setDetailIndex(next) }
                }}>{'Câu tiếp →'}</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
