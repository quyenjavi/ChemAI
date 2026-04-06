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
    <div className="space-y-4 max-w-xl">
      <h1 className="text-2xl font-semibold">Hồ sơ</h1>
      <Card>
        <CardHeader>
          <CardTitle>Thông tin</CardTitle>
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
    </div>
  )
}
