'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
type Grade = { id: string, name: string }
type Lesson = { id: string, grade_id: string, title: string, description: string | null }

export default function Dashboard() {
  const [grades, setGrades] = useState<Grade[]>([])
  const [activeGradeId, setActiveGradeId] = useState<string | null>(null)
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [search, setSearch] = useState('')
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [questionCounts, setQuestionCounts] = useState<Record<string, number>>({})
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    if (!s) return lessons
    return lessons.filter(l => l.title.toLowerCase().includes(s))
  }, [search, lessons])

  useEffect(() => {
    supabaseBrowser.from('grades').select('*').order('created_at', { ascending: true }).then(({ data }) => {
      if (data && data.length) {
        setGrades(data as any)
        setActiveGradeId(data[0].id)
      }
    })
  }, [])

  useEffect(() => {
    if (!activeGradeId) return
    supabaseBrowser
      .from('lessons')
      .select('id, grade_id, title, description')
      .eq('grade_id', activeGradeId)
      .order('created_at', { ascending: true })
      .then(async ({ data }) => {
        const list = (data || []) as any as Lesson[]
        setLessons(list)
        // fetch counts in parallel (N+1 acceptable for now)
        const entries = await Promise.all(list.map(async (ls) => {
          const { count } = await supabaseBrowser
            .from('questions')
            .select('id', { count: 'exact', head: true })
            .eq('lesson_id', ls.id)
          return [ls.id, count || 0] as const
        }))
        setCounts(Object.fromEntries(entries))
      })
  }, [activeGradeId])

  return (
    <div className="space-y-10">
      <h1 className="text-[32px] font-semibold">Chọn bài luyện tập</h1>
      <div className="flex gap-3 overflow-x-auto" role="tablist" aria-label="Chọn lớp">
        {grades.map(g => (
          <Button
            key={g.id}
            onClick={() => setActiveGradeId(g.id)}
            role="tab"
            aria-selected={activeGradeId===g.id}
            variant={activeGradeId===g.id ? 'default' : 'outline'}
          >
            {g.name}
          </Button>
        ))}
      </div>
      <div className="flex items-center">
        <Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Tìm bài theo tiêu đề..." />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filtered.map(ls => (
          <Card key={ls.id} className="hover:shadow-[0_10px_30px_rgba(0,0,0,0.45)] transition">
            <CardHeader>
              <CardTitle>{ls.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-[15px]" style={{color:'var(--text-secondary)'}}>{ls.description}</p>
              <div className="text-[14px] mt-2" style={{color:'var(--text-muted)'}}>{counts[ls.id] ?? 0} câu hỏi</div>
              <div className="mt-2 flex items-center gap-2">
                {(() => {
                  const maxBank = counts[ls.id] ?? 0
                  const max = Math.min(30, maxBank)
                  const disabled = max === 0
                  const val = questionCounts[ls.id] ?? Math.min(10, Math.max(1, max))
                  return (
                    <>
                      <label className="text-[14px]" style={{color:'var(--text-muted)'}}>Số câu:</label>
                      <input
                        type="number"
                        min={1}
                        max={max || 1}
                        disabled={disabled}
                        value={val}
                        onChange={e => {
                          const n = Math.max(1, Math.min(Number(e.target.value || 1), max || 1))
                          setQuestionCounts(m => ({ ...m, [ls.id]: n }))
                        }}
                        className="w-24 h-10 rounded-md border border-[var(--divider)] bg-[var(--bg)] text-[var(--text)] px-3"
                        aria-label="Chọn số câu hỏi"
                        title={`Chọn số câu (tối đa ${max})`}
                      />
                    </>
                  )
                })()}
              </div>
              <div className="mt-3">
                <a href={`/lesson/${ls.id}/quiz?n=${questionCounts[ls.id] ?? Math.min(10, Math.max(1, Math.min(30, counts[ls.id] ?? 0)))}`}>
                  <Button size="md" disabled={(counts[ls.id] ?? 0) === 0}>Làm bài</Button>
                </a>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
