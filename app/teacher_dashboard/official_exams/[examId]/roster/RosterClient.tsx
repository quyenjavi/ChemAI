'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type StudentRow = {
  id: string
  student_code: string
  full_name: string
  class_name: string | null
  seat_no: number | null
  status: string | null
  student_user_id: string | null
}

export default function RosterClient({ examId }: { examId: string }) {
  const [students, setStudents] = useState<StudentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [file, setFile] = useState<File | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const r = await fetch(`/api/teacher/official-exams/${examId}/roster`, { credentials: 'include' })
    const j = await r.json().catch(() => ({}))
    setLoading(false)
    if (!r.ok) {
      setError(j.error || 'Không thể tải roster')
      setStudents([])
      return
    }
    setStudents(Array.isArray(j.students) ? j.students : [])
  }, [examId])

  useEffect(() => { load() }, [load])

  const upload = async () => {
    if (!file) return
    setUploading(true)
    setError('')
    const form = new FormData()
    form.append('file', file)
    const r = await fetch(`/api/teacher/official-exams/${examId}/roster/upload`, {
      method: 'POST',
      body: form,
      credentials: 'include',
    })
    const j = await r.json().catch(() => ({}))
    setUploading(false)
    if (!r.ok) {
      setError(j.error || 'Upload roster thất bại')
      return
    }
    setFile(null)
    await load()
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Student Roster</h1>

      <Card>
        <CardHeader>
          <CardTitle>Upload roster (CSV)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <input type="file" accept=".csv,text/csv" onChange={e => setFile((e.target.files || [])[0] || null)} />
          <div className="flex items-center justify-end">
            <Button onClick={upload} disabled={!file || uploading}>
              {uploading ? 'Đang upload...' : 'Upload'}
            </Button>
          </div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Header gợi ý: student_code,full_name,class_name,seat_no
          </div>
          {error ? <div className="text-red-500 text-sm">{error}</div> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách học sinh</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Đang tải...</div>
          ) : students.length === 0 ? (
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Chưa có học sinh</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border rounded" style={{ borderColor: 'var(--divider)' }}>
                <thead>
                  <tr>
                    <th className="text-left p-2">SBD</th>
                    <th className="text-left p-2">Họ tên</th>
                    <th className="text-left p-2">Lớp</th>
                    <th className="text-left p-2">Số ghế</th>
                    <th className="text-left p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map(s => (
                    <tr key={s.id}>
                      <td className="p-2">{s.student_code}</td>
                      <td className="p-2">{s.full_name}</td>
                      <td className="p-2">{s.class_name || '—'}</td>
                      <td className="p-2">{s.seat_no ?? '—'}</td>
                      <td className="p-2">{s.status || '—'}</td>
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
