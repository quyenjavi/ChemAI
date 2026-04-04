'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type BatchRow = {
  id: string
  batch_name: string | null
  total_pages: number | null
  total_sheets: number | null
  processed_sheets: number | null
  uploaded_by: string | null
  metadata: any
  created_at: string
}

export default function SheetBatchesClient({ examId }: { examId: string }) {
  const [batches, setBatches] = useState<BatchRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [batchName, setBatchName] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const r = await fetch(`/api/teacher/official-exams/${examId}/sheet-batches`, { credentials: 'include' })
    const j = await r.json().catch(() => ({}))
    setLoading(false)
    if (!r.ok) {
      setError(j.error || 'Không thể tải batches')
      setBatches([])
      return
    }
    setBatches(Array.isArray(j.batches) ? j.batches : [])
  }, [examId])

  useEffect(() => { load() }, [load])

  const upload = async () => {
    if (!files.length) return
    setUploading(true)
    setError('')
    const form = new FormData()
    form.append('batch_name', batchName || 'Batch')
    for (const f of files) form.append('files', f)
    const r = await fetch(`/api/teacher/official-exams/${examId}/sheet-batches/upload`, {
      method: 'POST',
      body: form,
      credentials: 'include',
    })
    const j = await r.json().catch(() => ({}))
    setUploading(false)
    if (!r.ok) {
      setError(j.error || 'Upload batch thất bại')
      return
    }
    setFiles([])
    setBatchName('')
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

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Sheet Batches</h1>

      <Card>
        <CardHeader>
          <CardTitle>Upload batch</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input value={batchName} onChange={e => setBatchName(e.target.value)} placeholder="Tên batch (tuỳ chọn)" />
          <input type="file" multiple accept="image/*,.pdf,application/pdf" onChange={e => setFiles(Array.from(e.target.files || []))} />
          <div className="flex items-center justify-end">
            <Button onClick={upload} disabled={uploading || files.length === 0}>{uploading ? 'Đang upload...' : 'Upload'}</Button>
          </div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            MVP: Nếu upload nhiều ảnh → tạo sheet. Nếu upload 1 PDF → lưu batch PDF (chưa tách sheet tự động).
          </div>
          {error ? <div className="text-red-500 text-sm">{error}</div> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách batch</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Đang tải...</div>
          ) : batches.length === 0 ? (
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Chưa có batch nào</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border rounded" style={{ borderColor: 'var(--divider)' }}>
                <thead>
                  <tr>
                    <th className="text-left p-2">Batch</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Pages</th>
                    <th className="text-left p-2">Sheets</th>
                    <th className="text-left p-2">Processed</th>
                    <th className="text-left p-2">File</th>
                    <th className="text-left p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map(b => {
                    const status = b?.metadata?.process_status || '—'
                    const bucket = String(b?.metadata?.storage_bucket || '')
                    const path = String(b?.metadata?.storage_path || '')
                    return (
                      <tr key={b.id}>
                        <td className="p-2">{b.batch_name || b.id}</td>
                        <td className="p-2">{status}</td>
                        <td className="p-2">{b.total_pages ?? 0}</td>
                        <td className="p-2">{b.total_sheets ?? 0}</td>
                        <td className="p-2">{b.processed_sheets ?? 0}</td>
                        <td className="p-2">
                          {bucket && path ? (
                            <Button variant="outline" className="h-8 px-3 text-sm" onClick={() => openFile(bucket, path)}>
                              Mở
                            </Button>
                          ) : '—'}
                        </td>
                        <td className="p-2">
                          <Link href={`/teacher_dashboard/official_exams/${examId}/sheets`} prefetch={false} className="underline">Xem sheets</Link>
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
