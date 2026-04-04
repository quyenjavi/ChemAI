'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type PaperRow = { id: string, paper_code: string | null }
type StudentRow = { id: string, student_code: string, full_name: string }

type SheetRow = {
  id: string
  batch_id: string
  student_id: string | null
  paper_id: string | null
  detected_student_code: string | null
  detected_paper_code: string | null
  match_status: string | null
  process_status: string | null
  storage_bucket?: string | null
  storage_path?: string | null
  metadata: any
  created_at: string
  batch?: any
  student?: any
  paper?: any
}

function pickJoinOne(x: any) {
  if (!x) return null
  return Array.isArray(x) ? (x[0] || null) : x
}

export default function SheetsClient({ examId }: { examId: string }) {
  const [sheets, setSheets] = useState<SheetRow[]>([])
  const [papers, setPapers] = useState<PaperRow[]>([])
  const [students, setStudents] = useState<StudentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError('')
    const [s, p, r] = await Promise.all([
      fetch(`/api/teacher/official-exams/${examId}/sheets`, { credentials: 'include' }).then(x => x.json().then(j => ({ ok: x.ok, j }))),
      fetch(`/api/teacher/official-exams/${examId}/papers`, { credentials: 'include' }).then(x => x.json().then(j => ({ ok: x.ok, j }))),
      fetch(`/api/teacher/official-exams/${examId}/roster`, { credentials: 'include' }).then(x => x.json().then(j => ({ ok: x.ok, j }))),
    ])
    setLoading(false)
    if (!s.ok) { setError(s.j.error || 'Không thể tải sheets'); return }
    if (!p.ok) { setError(p.j.error || 'Không thể tải papers'); return }
    if (!r.ok) { setError(r.j.error || 'Không thể tải roster'); return }
    setSheets(Array.isArray(s.j.sheets) ? s.j.sheets : [])
    setPapers((Array.isArray(p.j.papers) ? p.j.papers : []).map((x: any) => ({ id: x.id, paper_code: x.paper_code })))
    setStudents((Array.isArray(r.j.students) ? r.j.students : []).map((x: any) => ({ id: x.id, student_code: x.student_code, full_name: x.full_name })))
  }, [examId])

  useEffect(() => { loadAll() }, [loadAll])

  const studentLabelById = useMemo(() => {
    const m: Record<string, string> = {}
    for (const s of students) m[s.id] = `${s.student_code} - ${s.full_name}`
    return m
  }, [students])

  const paperLabelById = useMemo(() => {
    const m: Record<string, string> = {}
    for (const p of papers) m[p.id] = p.paper_code || p.id
    return m
  }, [papers])

  const updateSheet = useCallback(async (sheetId: string, patch: { student_id?: string | null, paper_id?: string | null, answers_text?: string }) => {
    setSavingId(sheetId)
    setError('')
    const r = await fetch(`/api/teacher/official-exams/${examId}/sheets/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ sheet_id: sheetId, ...patch }),
    })
    const j = await r.json().catch(() => ({}))
    setSavingId(null)
    if (!r.ok) {
      setError(j.error || 'Update thất bại')
      return
    }
    setSheets(prev => prev.map(s => s.id === sheetId ? (j.sheet as any) : s))
  }, [examId])

  const openFile = useCallback(async (bucket: string, path: string) => {
    setError('')
    const r = await fetch(`/api/teacher/official-exams/${examId}/storage/signed-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ bucket, path, expires_in: 60 }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) {
      setError(j.error || 'Không thể tạo signed URL')
      return
    }
    const url = String(j.signed_url || '')
    if (!url) {
      setError('Signed URL trống')
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }, [examId])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Sheets Review</h1>
        <Link href={`/teacher_dashboard/official_exams/${examId}/sheet-batches`} prefetch={false} className="underline">Upload thêm batch</Link>
      </div>

      {error ? <div className="text-red-500 text-sm">{error}</div> : null}

      <Card>
        <CardHeader>
          <CardTitle>Danh sách sheets</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Đang tải...</div>
          ) : sheets.length === 0 ? (
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Chưa có sheet nào</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border rounded" style={{ borderColor: 'var(--divider)' }}>
                <thead>
                  <tr>
                    <th className="text-left p-2">Preview</th>
                    <th className="text-left p-2">Batch</th>
                    <th className="text-left p-2">Detected</th>
                    <th className="text-left p-2">Student</th>
                    <th className="text-left p-2">Paper</th>
                    <th className="text-left p-2">Match</th>
                    <th className="text-left p-2">Answers</th>
                    <th className="text-left p-2">Save</th>
                  </tr>
                </thead>
                <tbody>
                  {sheets.map(sh => {
                    const batch = pickJoinOne(sh.batch)
                    const student = pickJoinOne(sh.student)
                    const paper = pickJoinOne(sh.paper)
                    const bucket = String((sh as any)?.storage_bucket || '')
                    const path = String((sh as any)?.storage_path || '')
                    const answersText = String(sh?.metadata?.answers_text || '')
                    return (
                      <tr key={sh.id}>
                        <td className="p-2">
                          {bucket && path ? (
                            <Button variant="outline" className="h-8 px-3 text-sm" onClick={() => openFile(bucket, path)}>
                              Mở
                            </Button>
                          ) : '—'}
                        </td>
                        <td className="p-2">{batch?.batch_name || sh.batch_id}</td>
                        <td className="p-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                          SBD: {sh.detected_student_code || '—'}<br />
                          Mã đề: {sh.detected_paper_code || '—'}
                        </td>
                        <td className="p-2">
                          <select
                            className="border rounded p-1 bg-transparent select-clean"
                            value={sh.student_id || ''}
                            onChange={e => updateSheet(sh.id, { student_id: e.target.value || null })}
                          >
                            <option value="">—</option>
                            {students.map(s => (
                              <option key={s.id} value={s.id}>{s.student_code} - {s.full_name}</option>
                            ))}
                          </select>
                          <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                            {student?.student_code ? `${student.student_code} - ${student.full_name}` : (sh.student_id ? (studentLabelById[sh.student_id] || '') : '')}
                          </div>
                        </td>
                        <td className="p-2">
                          <select
                            className="border rounded p-1 bg-transparent select-clean"
                            value={sh.paper_id || ''}
                            onChange={e => updateSheet(sh.id, { paper_id: e.target.value || null })}
                          >
                            <option value="">—</option>
                            {papers.map(p => (
                              <option key={p.id} value={p.id}>{p.paper_code || p.id}</option>
                            ))}
                          </select>
                          <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                            {paper?.paper_code ? `Mã đề ${paper.paper_code}` : (sh.paper_id ? (paperLabelById[sh.paper_id] || '') : '')}
                          </div>
                        </td>
                        <td className="p-2">{sh.match_status || '—'}</td>
                        <td className="p-2">
                          <input
                            className="w-56 border rounded p-1 bg-transparent"
                            defaultValue={answersText}
                            placeholder="VD: 1A 2C 3D ..."
                            onBlur={e => {
                              const v = e.target.value || ''
                              if (v === answersText) return
                              updateSheet(sh.id, { answers_text: v })
                            }}
                          />
                        </td>
                        <td className="p-2">
                          <Button variant="outline" className="h-8 px-3 text-sm" disabled={savingId === sh.id} onClick={() => loadAll()}>
                            {savingId === sh.id ? '...' : 'Refresh'}
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
