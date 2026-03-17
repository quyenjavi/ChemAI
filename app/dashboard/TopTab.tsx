'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function TopTab() {
  const [topStudents, setTopStudents] = useState<any[]>([])
  const [topSchools, setTopSchools] = useState<any[]>([])
  const [loadingTop, setLoadingTop] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [canUpdate, setCanUpdate] = useState(false)
  const [lastUpdatedStudents, setLastUpdatedStudents] = useState<string | null>(null)
  const [lastUpdatedSchools, setLastUpdatedSchools] = useState<string | null>(null)

  const fetchTop = useCallback(() => {
    setLoadingTop(true)
    setTopStudents([])
    setTopSchools([])
    fetch('/api/leaderboard/top', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Lỗi tải TOP')))
      .then(json => {
        setCanUpdate(!!json?.can_update)
        setLastUpdatedStudents(json?.last_updated_students ?? null)
        setLastUpdatedSchools(json?.last_updated_schools ?? null)
        setTopStudents(Array.isArray(json?.top_students) ? json.top_students : [])
        setTopSchools(Array.isArray(json?.top_schools) ? json.top_schools : [])
      })
      .catch(() => {})
      .finally(() => setLoadingTop(false))
  }, [])

  const lastUpdatedLabel = useMemo(() => {
    const a = lastUpdatedStudents ? Date.parse(lastUpdatedStudents) : 0
    const b = lastUpdatedSchools ? Date.parse(lastUpdatedSchools) : 0
    const ts = Math.max(a, b)
    if (!ts) return ''
    return new Date(ts).toLocaleString('vi-VN')
  }, [lastUpdatedStudents, lastUpdatedSchools])

  const handleUpdateTop = useCallback(async () => {
    setUpdating(true)
    const r = await fetch('/api/leaderboard/update', { method: 'POST', credentials: 'include' }).catch(() => null)
    if (!r || !r.ok) {
      setUpdating(false)
      alert('Cập nhật leaderboard thất bại')
      return
    }
    await fetchTop()
    setUpdating(false)
    alert('Đã cập nhật leaderboard thành công')
  }, [fetchTop])

  useEffect(() => {
    fetchTop()
  }, [fetchTop])

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex flex-col gap-1">
          <div className="text-lg font-semibold">TOP</div>
          {lastUpdatedLabel ? (
            <div className="text-sm" style={{color:'var(--text-muted)'}}>Cập nhật lần cuối: {lastUpdatedLabel}</div>
          ) : null}
        </div>
        {canUpdate ? (
          <button
            className="text-sm px-3 py-2 rounded-md border border-slate-200/20 bg-slate-900/40 hover:bg-slate-900/55 disabled:opacity-50"
            disabled={updating}
            onClick={handleUpdateTop}
          >
            {updating ? 'Đang cập nhật...' : 'Update Top'}
          </button>
        ) : null}
      </div>

      <Card className="border border-purple-400/50 bg-purple-500/10">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
            <CardTitle className="text-purple-100">Top trường thi</CardTitle>
            <div className="text-sm" style={{color:'rgba(237,233,254,0.85)'}}>
              Điểm trung bình các bài thi (ít nhất 2 bài)
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingTop ? <div className="text-sm" style={{color:'var(--text-muted)'}}>Đang tải...</div> : (
            <div className="overflow-x-auto">
              <table className="w-full border rounded text-sm" style={{borderColor:'var(--divider)'}}>
                <thead>
                  <tr>
                    <th className="text-left p-2">Hạng</th>
                    <th className="text-left p-2">Học sinh</th>
                    <th className="text-left p-2">Lớp</th>
                    <th className="text-left p-2">Trường</th>
                    <th className="text-left p-2">Điểm trung bình</th>
                    <th className="text-left p-2">Số bài thi</th>
                  </tr>
                </thead>
                <tbody>
                  {topSchools.length === 0 ? (
                    <tr><td className="p-3" colSpan={6} style={{color:'var(--text-muted)'}}>Chưa có dữ liệu.</td></tr>
                  ) : topSchools.map((r) => (
                    <tr key={`${r.rank}-${r.student_name}-${r.class_name}-${r.school_name}`}>
                      <td className="p-2">{r.rank ?? '—'}</td>
                      <td className="p-2">{r.student_name || '—'}</td>
                      <td className="p-2">{r.class_name || '—'}</td>
                      <td className="p-2">{r.school_name || '—'}</td>
                      <td className="p-2">{Number(r.avg_score || 0).toFixed(2)}</td>
                      <td className="p-2">{r.total_attempts ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border border-slate-200/20 bg-slate-900/40">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
            <CardTitle>THÔNG BÁO</CardTitle>
            <div className="text-sm" style={{color:'var(--text-muted)'}}>Lời xin lỗi</div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-sm whitespace-pre-line" style={{color:'var(--text-secondary)'}}>
            Trong quá trình các em làm bài đã giúp phát hiện nhiều câu đề chưa chuẩn, các thầy cô đã kiểm tra lại, update đáp án chính xác và tính lại điểm cho các em. Cảm ơn các em nhiều!
            {'\n\n'}
            Chúng ta không ai là luôn đúng các em, AI, hay cả các thầy cô cũng vậy phải không? Mong các em tiếp tục đóng góp để website hoàn thiện hơn. Cảm ơn các em nhiều.
            {'\n\n'}
            Mọi đóng góp gửi về: <a className="underline" href="https://forms.gle/hGufJXzeb7FBiPgD9" target="_blank" rel="noreferrer" style={{color:'var(--gold)'}}>https://forms.gle/hGufJXzeb7FBiPgD9</a>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
