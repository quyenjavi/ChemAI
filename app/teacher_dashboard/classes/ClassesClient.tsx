'use client'
import { useEffect, useState } from 'react'

type ClassItem = {
  class_id: string,
  class_name: string,
  grade_name: string,
  academic_year_id: string | null,
  total_students: number
}

type StudentRow = {
  user_id: string,
  class_id: string,
  full_name: string,
  total_attempts: number,
  last_attempt_at: string | null,
  avg_score_percent: number
}

export default function ClassesClient() {
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [selected, setSelected] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [students, setStudents] = useState<StudentRow[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/teacher/classes', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load classes')))
      .then(json => {
        const list = (json?.classes || []) as ClassItem[]
        setClasses(list)
        if (list.length) {
          setSelected(list[0].class_id)
        }
      })
      .catch(err => setError(err.message || 'Lỗi tải danh sách lớp'))
  }, [])

  useEffect(() => {
    if (!selected) { setStudents([]); return }
    setLoading(true)
    fetch(`/api/teacher/classes/${selected}/students`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load students')))
      .then(json => {
        setStudents((json?.students || []) as StudentRow[])
      })
      .catch(err => setError(err.message || 'Lỗi tải học sinh'))
      .finally(() => setLoading(false))
  }, [selected])

  return (
    <div className="space-y-4">
      <select
        className="w-full mt-1 border rounded p-2 bg-transparent select-clean"
        value={selected}
        onChange={e => setSelected(e.target.value)}
        disabled={!classes.length}
        aria-label="Chọn lớp"
      >
        {classes.length === 0 ? <option value="">Chưa có lớp</option> : null}
        {classes.map(c => (
          <option key={c.class_id} value={c.class_id}>
            {c.class_name}
          </option>
        ))}
      </select>
      {error ? <div className="text-red-500 text-sm">{error}</div> : null}
      <div className="overflow-x-auto">
        <table className="w-full border rounded" style={{borderColor:'var(--divider)'}}>
          <thead>
            <tr>
              <th className="text-left p-2">Họ tên</th>
              <th className="text-left p-2">Số lần làm bài</th>
              <th className="text-left p-2">Lần gần nhất</th>
              <th className="text-left p-2">Điểm trung bình</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="p-3 text-sm" colSpan={4}>Đang tải...</td></tr>
            ) : students.length === 0 ? (
              <tr><td className="p-3 text-sm" style={{color:'var(--text-muted)'}} colSpan={4}>Chưa có học sinh</td></tr>
            ) : students.map(s => (
              <tr key={s.user_id}>
                <td className="p-2">{s.full_name || s.user_id}</td>
                <td className="p-2">{s.total_attempts || 0}</td>
                <td className="p-2">{s.total_attempts ? (s.last_attempt_at ? new Date(s.last_attempt_at).toLocaleString() : '--') : 'Chưa làm bài'}</td>
                <td className="p-2">{s.total_attempts ? `${s.avg_score_percent}%` : '--'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
