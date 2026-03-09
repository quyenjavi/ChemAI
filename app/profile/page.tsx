'use client'
import { useEffect, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default function ProfilePage() {
  const [fullName, setFullName] = useState('')
  const [schools, setSchools] = useState<Array<{id:string,name:string}>>([])
  const [grades, setGrades] = useState<Array<{id:string,name:string}>>([])
  const [classes, setClasses] = useState<Array<{id:string,name:string}>>([])
  const [schoolId, setSchoolId] = useState<string | ''>('')
  const [gradeId, setGradeId] = useState<string | ''>('')
  const [classId, setClassId] = useState<string | ''>('')
  const [academicYearId, setAcademicYearId] = useState<string | null>(null)
  const [school, setSchool] = useState('')
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
        setSchool(existing.school || '')
        setAcademicYear(existing.academic_year || '')
        setBirthDate(existing.birth_date || '')
        setSchoolId(existing.school_id || '')
        setGradeId(existing.grade_id || '')
        setClassId(existing.class_id || '')
        setAcademicYearId(existing.academic_year_id || null)
      }
      const { data: city } = await supabaseBrowser.from('cities').select('id,name').eq('name','Đà Nẵng').maybeSingle()
      const cId = city?.id || null
      if (cId) {
        const { data: sch } = await supabaseBrowser.from('schools').select('id,name').eq('city_id', cId).order('name', { ascending: true })
        setSchools(sch || [])
        if (!existing?.school_id) {
          const defaultSchool = (sch || []).find(s => s.name === 'THPT Phạm Phú Thứ') || (sch || [])[0]
          if (defaultSchool) setSchoolId(defaultSchool.id)
        }
      }
      const { data: gr } = await supabaseBrowser.from('grades').select('id,name').order('name', { ascending: true })
      setGrades((gr || []).filter(g => ['10','11','12'].includes(String(g.name))))
      if (!existing?.academic_year_id) {
        const now = new Date()
        const y = now.getFullYear()
        const m = now.getMonth() + 1
        const d = now.getDate()
        const label = (m > 7 || (m === 7 && d >= 1)) ? `${y}-${y+1}` : `${y-1}-${y}`
        const { data: ay } = await supabaseBrowser.from('academic_years').select('id,name').eq('name', label).maybeSingle()
        setAcademicYearId(ay?.id || null)
        setAcademicYear(ay?.name || '')
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

  useEffect(() => {
    if (!schoolId || !gradeId || !academicYearId) {
      setClasses([])
      return
    }
    supabaseBrowser.from('classes')
      .select('id,name')
      .eq('school_id', schoolId)
      .eq('grade_id', gradeId)
      .eq('academic_year_id', academicYearId)
      .then(({ data }) => {
        const list = (data || []).slice()
        list.sort((a, b) => {
          const [ga, ca] = String(a.name || '').split('.').map(v => parseInt(v || '0', 10))
          const [gb, cb] = String(b.name || '').split('.').map(v => parseInt(v || '0', 10))
          if ((ga || 0) !== (gb || 0)) return (ga || 0) - (gb || 0)
          return (ca || 0) - (cb || 0)
        })
        setClasses(list)
      })
  }, [schoolId, gradeId, academicYearId])

  useEffect(() => {
    if (!classId) { setClassName(''); return }
    supabaseBrowser.from('classes').select('name').eq('id', classId).maybeSingle().then(({ data }) => {
      setClassName(data?.name || '')
    })
  }, [classId])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await fetch('/api/profile/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: fullName,
        school_id: schoolId || null,
        grade_id: gradeId || null,
        class_id: classId || null,
        academic_year_id: academicYearId || null,
        school,
        academic_year: academicYear,
        birth_date: birthDate
      })
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
            <div>
              <label className="text-sm">Trường</label>
              <select className="w-full mt-1 border rounded p-2 bg-transparent select-clean" value={schoolId} onChange={e=>setSchoolId(e.target.value)} disabled={!schools.length}>
                <option value="" disabled>Chọn trường</option>
                {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm">Khối</label>
              <select className="w-full mt-1 border rounded p-2 bg-transparent select-clean" value={gradeId} onChange={e=>setGradeId(e.target.value)} disabled={!grades.length}>
                <option value="" disabled>Chọn khối</option>
                {grades.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm">Lớp</label>
              <select className="w-full mt-1 border rounded p-2 bg-transparent select-clean" value={classId} onChange={e=>setClassId(e.target.value)} disabled={!(schoolId && gradeId && academicYearId) || classes.length===0}>
                <option value="" disabled>Chọn lớp</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
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
