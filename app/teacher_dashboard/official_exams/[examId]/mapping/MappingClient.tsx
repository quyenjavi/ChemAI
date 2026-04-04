'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Paper = {
  id: string
  paper_code: string | null
  upload_order: number | null
  is_master_source: boolean | null
  total_questions: number | null
  process_status: string | null
}

type MasterQuestion = {
  id: string
  master_question_no: number
  question_id: string | null
  score: number | null
}

type MappingRow = {
  id: string
  paper_id: string
  paper_question_no: number
  master_question_id: string | null
  master_question_no: number | null
  question_id: string | null
  confidence: number | null
}

export default function MappingClient({ examId }: { examId: string }) {
  const [papers, setPapers] = useState<Paper[]>([])
  const [masters, setMasters] = useState<MasterQuestion[]>([])
  const [mappings, setMappings] = useState<MappingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [initQuestions, setInitQuestions] = useState<number>(40)
  const [initForce, setInitForce] = useState(false)
  const [initLoading, setInitLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const r = await fetch(`/api/teacher/official-exams/${examId}/mapping`, { credentials: 'include' })
    const j = await r.json().catch(() => ({}))
    setLoading(false)
    if (!r.ok) {
      setError(j.error || 'Không thể tải mapping')
      return
    }
    setPapers(Array.isArray(j.papers) ? j.papers : [])
    setMasters(Array.isArray(j.master_questions) ? j.master_questions : [])
    setMappings(Array.isArray(j.mappings) ? j.mappings : [])
  }, [examId])

  useEffect(() => { load() }, [load])

  const mappingByPaper = useMemo(() => {
    const out: Record<string, MappingRow[]> = {}
    for (const m of mappings) {
      out[m.paper_id] = out[m.paper_id] || []
      out[m.paper_id].push(m)
    }
    for (const pid of Object.keys(out)) {
      out[pid].sort((a, b) => (a.paper_question_no || 0) - (b.paper_question_no || 0))
    }
    return out
  }, [mappings])

  const init = async () => {
    setInitLoading(true)
    setError('')
    const r = await fetch(`/api/teacher/official-exams/${examId}/mapping/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ total_questions: initQuestions, force: initForce }),
    })
    const j = await r.json().catch(() => ({}))
    setInitLoading(false)
    if (!r.ok) {
      setError(j.error || 'Init thất bại')
      return
    }
    await load()
  }

  const update = async (paperId: string, paperQuestionNo: number, masterQuestionNo: number) => {
    setError('')
    const r = await fetch(`/api/teacher/official-exams/${examId}/mapping/upsert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ paper_id: paperId, paper_question_no: paperQuestionNo, master_question_no: masterQuestionNo, confidence: 1 }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) {
      setError(j.error || 'Update thất bại')
      return
    }
    setMappings(prev => {
      const next = prev.filter(x => !(x.paper_id === paperId && x.paper_question_no === paperQuestionNo))
      next.push(j.mapping as MappingRow)
      return next
    })
  }

  const totalMaster = masters.length

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Master Mapping</h1>

      {error ? <div className="text-red-500 text-sm">{error}</div> : null}

      <Card>
        <CardHeader>
          <CardTitle>Khởi tạo master questions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div>
              <label className="text-sm">Tổng số câu (master)</label>
              <Input value={String(initQuestions)} onChange={e => setInitQuestions(parseInt(e.target.value || '0', 10) || 0)} />
            </div>
            <div className="flex items-center gap-2">
              <input id="force" type="checkbox" checked={initForce} onChange={e => setInitForce(e.target.checked)} />
              <label htmlFor="force" className="text-sm">Force re-init (xóa mapping cũ)</label>
            </div>
            <div className="flex items-center justify-end">
              <Button onClick={init} disabled={initLoading || !initQuestions}>{initLoading ? 'Đang init...' : 'Init mapping'}</Button>
            </div>
          </div>
          <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Master questions hiện có: {totalMaster}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Master questions</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Đang tải...</div>
          ) : masters.length === 0 ? (
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Chưa có master questions</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border rounded" style={{ borderColor: 'var(--divider)' }}>
                <thead>
                  <tr>
                    <th className="text-left p-2">Master #</th>
                    <th className="text-left p-2">Question ID</th>
                    <th className="text-left p-2">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {masters.map(m => (
                    <tr key={m.id}>
                      <td className="p-2">{m.master_question_no}</td>
                      <td className="p-2">{m.question_id || '—'}</td>
                      <td className="p-2">{m.score ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {papers.map(p => {
        const rows = mappingByPaper[p.id] || []
        return (
          <Card key={p.id}>
            <CardHeader>
              <CardTitle>
                Paper {p.paper_code || '—'} {p.is_master_source ? '(master)' : ''}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {rows.length === 0 ? (
                <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Chưa có mapping</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border rounded" style={{ borderColor: 'var(--divider)' }}>
                    <thead>
                      <tr>
                        <th className="text-left p-2">Paper #</th>
                        <th className="text-left p-2">Master #</th>
                        <th className="text-left p-2">Question ID</th>
                        <th className="text-left p-2">Confidence</th>
                        <th className="text-left p-2">Override</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(r => (
                        <tr key={r.id}>
                          <td className="p-2">{r.paper_question_no}</td>
                          <td className="p-2">{r.master_question_no ?? '—'}</td>
                          <td className="p-2">{r.question_id || '—'}</td>
                          <td className="p-2">{r.confidence ?? '—'}</td>
                          <td className="p-2">
                            <div className="flex items-center gap-2">
                              <input
                                className="w-20 border rounded p-1 bg-transparent"
                                defaultValue={String(r.master_question_no ?? '')}
                                onBlur={e => {
                                  const v = parseInt(e.target.value || '0', 10) || 0
                                  if (!v) return
                                  if (v === r.master_question_no) return
                                  update(p.id, r.paper_question_no, v)
                                }}
                              />
                              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>blur để lưu</div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
