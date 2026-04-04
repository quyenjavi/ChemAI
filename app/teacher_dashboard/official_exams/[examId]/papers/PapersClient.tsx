'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type PaperRow = {
  id: string
  paper_code: string | null
  upload_order: number | null
  is_master_source: boolean | null
  process_status: string | null
  verification_note: string | null
  total_questions: number | null
  metadata: any
  created_at: string
  updated_at: string | null
}

export default function PapersClient({ examId }: { examId: string }) {
  const [papers, setPapers] = useState<PaperRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [uploading, setUploading] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [verifyingPaperId, setVerifyingPaperId] = useState<string | null>(null)
  const [answerKeySaving, setAnswerKeySaving] = useState(false)
  const [answerKeyText, setAnswerKeyText] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const r = await fetch(`/api/teacher/official-exams/${examId}/papers`, { credentials: 'include' })
    const j = await r.json().catch(() => ({}))
    setLoading(false)
    if (!r.ok) {
      setError(j.error || 'Không thể tải papers')
      setPapers([])
      return
    }
    setPapers(Array.isArray(j.papers) ? j.papers : [])
  }, [examId])

  useEffect(() => { load() }, [load])

  const masterPaper = useMemo(() => papers.find(p => !!p.is_master_source) || null, [papers])
  useEffect(() => {
    const t = String(masterPaper?.metadata?.answer_key_text || '')
    setAnswerKeyText(t)
  }, [masterPaper?.id, masterPaper?.metadata?.answer_key_text])

  const upload = async () => {
    if (!files.length) return
    setUploading(true)
    setError('')
    const form = new FormData()
    for (const f of files) form.append('files', f)
    const r = await fetch(`/api/teacher/official-exams/${examId}/papers/upload`, {
      method: 'POST',
      body: form,
      credentials: 'include',
    })
    const j = await r.json().catch(() => ({}))
    setUploading(false)
    if (!r.ok) {
      setError(j.error || 'Upload thất bại')
      return
    }
    setFiles([])
    await load()
  }

  const setMaster = async (paperId: string) => {
    setError('')
    const r = await fetch(`/api/teacher/official-exams/${examId}/papers/set-master`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paper_id: paperId }),
      credentials: 'include',
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) {
      setError(j.error || 'Không thể set master')
      return
    }
    await load()
  }

  const saveAnswerKey = async () => {
    if (!masterPaper?.id) return
    setAnswerKeySaving(true)
    setError('')
    const r = await fetch(`/api/teacher/official-exams/${examId}/papers/set-answer-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ paper_id: masterPaper.id, answers_text: answerKeyText }),
    })
    const j = await r.json().catch(() => ({}))
    setAnswerKeySaving(false)
    if (!r.ok) {
      setError(j.error || 'Không thể lưu answer key')
      return
    }
    await load()
  }

  const openFile = async (bucket: string, path: string) => {
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
  }

  const verifyPaper = async (paperId: string) => {
    setVerifyingPaperId(paperId)
    setError('')
    const r = await fetch(`/api/teacher/official-exams/${examId}/papers/parse-and-insert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ paper_id: paperId }),
    })
    const j = await r.json().catch(() => ({}))
    setVerifyingPaperId(null)
    if (!r.ok) {
      setError(j.error || 'Phân tích đề thất bại')
      return
    }
    await load()
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Upload đề thi</h1>

      <Card>
        <CardHeader>
          <CardTitle>Upload 4 mã đề</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            type="file"
            multiple
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={e => setFiles(Array.from(e.target.files || []))}
          />
          <div className="flex items-center justify-between">
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Master hiện tại: {masterPaper?.paper_code || '—'}
            </div>
            <Button onClick={upload} disabled={uploading || files.length === 0}>
              {uploading ? 'Đang upload...' : 'Upload'}
            </Button>
          </div>
          {masterPaper ? (
            <div className="space-y-2">
              <div className="text-sm font-semibold">Answer key (cho paper master)</div>
              <input
                className="w-full border rounded p-2 bg-transparent"
                value={answerKeyText}
                onChange={e => setAnswerKeyText(e.target.value)}
                placeholder="VD: 1A 2C 3D 4B ..."
              />
              <div className="flex items-center justify-end">
                <Button variant="outline" className="h-9 px-3 text-sm" onClick={saveAnswerKey} disabled={answerKeySaving || !answerKeyText.trim()}>
                  {answerKeySaving ? 'Đang lưu...' : 'Lưu answer key'}
                </Button>
              </div>
            </div>
          ) : null}
          {error ? <div className="text-red-500 text-sm">{error}</div> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách papers</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Đang tải...</div>
          ) : papers.length === 0 ? (
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Chưa có paper nào</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border rounded" style={{ borderColor: 'var(--divider)' }}>
                <thead>
                  <tr>
                    <th className="text-left p-2">Mã đề</th>
                    <th className="text-left p-2">Upload order</th>
                    <th className="text-left p-2">Master</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Questions</th>
                    <th className="text-left p-2">File</th>
                    <th className="text-left p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {papers.map(p => {
                    const bucket = String(p?.metadata?.storage_bucket || '')
                    const path = String(p?.metadata?.storage_path || '')
                    const status = String(p.process_status || '')
                    const canVerify = status === 'uploaded' || status === 'failed'
                    return (
                      <tr key={p.id}>
                        <td className="p-2">{p.paper_code || '—'}</td>
                        <td className="p-2">{p.upload_order ?? '—'}</td>
                        <td className="p-2">{p.is_master_source ? '✅' : ''}</td>
                        <td className="p-2">{p.process_status || '—'}</td>
                        <td className="p-2">{(p.total_questions && p.total_questions > 0) ? p.total_questions : '—'}</td>
                        <td className="p-2">
                          {bucket && path ? (
                            <Button variant="outline" className="h-8 px-3 text-sm" onClick={() => openFile(bucket, path)}>
                              Mở
                            </Button>
                          ) : '—'}
                        </td>
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              className="h-8 px-3 text-sm"
                              disabled={!!p.is_master_source}
                              onClick={() => setMaster(p.id)}
                            >
                              Set master
                            </Button>
                            <Button
                              className="h-8 px-3 text-sm"
                              disabled={!canVerify || verifyingPaperId === p.id}
                              onClick={() => verifyPaper(p.id)}
                            >
                              {verifyingPaperId === p.id ? 'Đang phân tích...' : 'Phân tích đề'}
                            </Button>
                          </div>
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
