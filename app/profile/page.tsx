'use client'
import { useEffect, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default function ProfilePage() {
  const [fullName, setFullName] = useState('')
  const [school, setSchool] = useState('Trường THPT Phạm Phú Thứ')
  const [className, setClassName] = useState('')
  const [academicYear, setAcademicYear] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [attempts, setAttempts] = useState<Array<{ id: string, lesson_id: string, lesson_title: string, total: number, correct: number, percent: number, created_at: string }>>([])
  const router = useRouter()

  useEffect(() => {
    supabaseBrowser.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.push('/login')
        return
      }
      const { data: existing } = await supabaseBrowser
        .from('student_profiles')
        .select('*')
        .eq('user_id', data.user.id)
        .maybeSingle()
      if (existing) {
        setFullName(existing.full_name || '')
        setSchool(existing.school || 'Trường THPT Phạm Phú Thứ')
        setClassName(existing.class_name || '')
        setAcademicYear(existing.academic_year || '')
        setBirthDate(existing.birth_date || '')
      }
      // load attempts + lesson titles
      const { data: atts } = await supabaseBrowser
        .from('quiz_attempts')
        .select('id, lesson_id, total_questions, correct_answers, score_percent, created_at')
        .eq('user_id', data.user.id)
        .order('created_at', { ascending: false })
        .limit(50)
      const list = (atts || []) as any as Array<{ id: string, lesson_id: string, total_questions: number, correct_answers: number, score_percent: number, created_at: string }>
      const lessonIds = Array.from(new Set(list.map(a => a.lesson_id).filter(Boolean)))
      let titleById: Record<string, string> = {}
      if (lessonIds.length) {
        const { data: ls } = await supabaseBrowser.from('lessons').select('id,title').in('id', lessonIds)
        titleById = Object.fromEntries((ls || []).map((x: any) => [x.id, x.title || '']))
      }
      setAttempts(list.map(a => ({
        id: a.id,
        lesson_id: a.lesson_id,
        lesson_title: titleById[a.lesson_id] || 'Bài học',
        total: a.total_questions || 0,
        correct: a.correct_answers || 0,
        percent: a.score_percent || 0,
        created_at: a.created_at
      })))
    })
  }, [router])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await fetch('/api/profile/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: fullName, school, class_name: className, academic_year: academicYear, birth_date: birthDate })
    })
    setLoading(false)
    if (!res.ok) {
      const x = await res.json().catch(()=>({ error: 'Lỗi' }))
      setError(x.error || 'Lỗi')
      return
    }
    router.push('/dashboard')
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Hồ sơ học sinh</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-3">
            <Input placeholder="Họ tên" value={fullName} onChange={e=>setFullName(e.target.value)} />
            <Input placeholder="Trường" value={school} onChange={e=>setSchool(e.target.value)} />
            <Input placeholder="Lớp" value={className} onChange={e=>setClassName(e.target.value)} />
            <Input placeholder="Năm học" value={academicYear} onChange={e=>setAcademicYear(e.target.value)} />
            <Input placeholder="Ngày sinh" type="date" value={birthDate} onChange={e=>setBirthDate(e.target.value)} />
            {error ? <div className="text-red-600 text-sm">{error}</div> : null}
            <Button disabled={loading}>
              {loading ? 'Đang lưu...' : 'Lưu hồ sơ'}
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Lịch sử làm bài</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {attempts.length === 0 ? (
              <div className="text-sm" style={{color:'var(--text-muted)'}}>Chưa có bài đã làm.</div>
            ) : attempts.map(a => (
              <div key={a.id} className="border rounded p-3">
                <div className="text-sm font-medium">{a.lesson_title}</div>
                <div className="text-xs text-slate-600 mt-1">
                  Điểm: {a.correct}/{a.total} ({a.percent}%)
                </div>
                <div className="text-xs text-slate-500">
                  Thời gian: {new Date(a.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
