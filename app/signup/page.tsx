'use client'
import { useEffect, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [fullName, setFullName] = useState('')
  const [cityId, setCityId] = useState<string | null>(null)
  const [schools, setSchools] = useState<Array<{id:string,name:string}>>([])
  const [grades, setGrades] = useState<Array<{id:string,name:string}>>([])
  const [classes, setClasses] = useState<Array<{id:string,name:string}>>([])
  const [schoolId, setSchoolId] = useState<string | ''>('')
  const [gradeId, setGradeId] = useState<string | ''>('')
  const [classId, setClassId] = useState<string | ''>('')
  const [academicYearId, setAcademicYearId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const router = useRouter()

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  const passLenOk = password.length >= 8
  const passMatch = password === password2
  const formValid = !!(fullName && emailValid && passLenOk && passMatch && schoolId && gradeId && classId)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setInterval(() => setCooldown(s => (s > 0 ? s - 1 : 0)), 1000)
    return () => clearInterval(t)
  }, [cooldown])

  function computeAcademicYearLabel(d: Date) {
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    const day = d.getDate()
    if (m > 7 || (m === 7 && day >= 1)) {
      return `${y}-${y+1}`
    }
    return `${y-1}-${y}`
  }

  useEffect(() => {
    const init = async () => {
      const { data: city } = await supabaseBrowser.from('cities').select('id,name').eq('name','Đà Nẵng').maybeSingle()
      const cId = city?.id || null
      setCityId(cId)
      if (cId) {
        const { data: sch } = await supabaseBrowser.from('schools').select('id,name').eq('city_id', cId).order('name', { ascending: true })
        setSchools(sch || [])
        const defaultSchool = (sch || []).find(s => s.name === 'THPT Phạm Phú Thứ') || (sch || [])[0]
        if (defaultSchool) setSchoolId(defaultSchool.id)
      }
      const { data: gr } = await supabaseBrowser.from('grades').select('id,name').order('name', { ascending: true })
      setGrades((gr || []).filter(g => ['10','11','12'].includes(String(g.name))))
      const label = computeAcademicYearLabel(new Date())
      const { data: ay } = await supabaseBrowser.from('academic_years').select('id,name').eq('name', label).maybeSingle()
      setAcademicYearId(ay?.id || null)
    }
    init()
  }, [])

  useEffect(() => {
    if (!schoolId || !gradeId || !academicYearId) {
      setClasses([])
      setClassId('')
      return
    }
    supabaseBrowser.from('classes')
      .select('id,name')
      .eq('school_id', schoolId)
      .eq('grade_id', gradeId)
      .eq('academic_year_id', academicYearId)
      .order('name', { ascending: true })
      .then(({ data }) => {
        setClasses(data || [])
        setClassId('')
      })
  }, [schoolId, gradeId, academicYearId])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (cooldown > 0) return
    setLoading(true)
    setError('')
    const validClass = classes.some(c => c.id === classId)
    if (!formValid) {
      setLoading(false)
      if (!passLenOk) {
        setError('Mật khẩu phải có ít nhất 8 ký tự')
      } else if (!emailValid) {
        setError('Email không hợp lệ')
      } else if (!passMatch) {
        setError('Mật khẩu nhập lại không khớp')
      } else if (!validClass) {
        setError('Lớp không hợp lệ cho trường/khối/năm học đã chọn')
      } else {
        setError('Vui lòng nhập đầy đủ thông tin bắt buộc')
      }
      return
    }
    if (!passMatch) {
      setLoading(false)
      setError('Mật khẩu nhập lại không khớp')
      return
    }
    if (!validClass) {
      setLoading(false)
      setError('Lớp không hợp lệ cho trường/khối/năm học đã chọn')
      return
    }
    const r = await fetch('/api/auth/instant-signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        full_name: fullName,
        school_id: schoolId,
        grade_id: gradeId,
        class_id: classId,
        academic_year_id: academicYearId
      })
    })
    if (!r.ok) {
      const j = await r.json().catch(()=>({}))
      setLoading(false)
      setError(j.error || 'Đăng ký thất bại')
      return
    }
    const { error: signInErr } = await supabaseBrowser.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (signInErr) {
      setError(signInErr.message)
      return
    }
    await fetch('/api/profile/migrate', { method: 'POST' }).catch(()=>{})
    router.push('/profile')
  }

  return (
    <Card className="max-w-sm mx-auto">
      <CardHeader>
        <CardTitle>Đăng ký</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={onSubmit}>
          <Input placeholder="Họ tên" value={fullName} onChange={e=>setFullName(e.target.value)} required />
          <Input placeholder="Email" type="email" value={email} onChange={e=>setEmail(e.target.value)} required />
          <Input placeholder="Mật khẩu" type="password" value={password} onChange={e=>setPassword(e.target.value)} required />
          {!passLenOk ? <div className="text-red-600 text-xs">Mật khẩu phải có ít nhất 8 ký tự</div> : null}
          <Input placeholder="Nhập lại mật khẩu" type="password" value={password2} onChange={e=>setPassword2(e.target.value)} required />
          {passLenOk && !passMatch ? <div className="text-red-600 text-xs">Mật khẩu nhập lại không khớp</div> : null}
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
          {error ? <div className="text-red-600 text-sm">{error}</div> : null}
          <Button disabled={loading || cooldown>0 || !formValid} className="w-full">
            {loading ? 'Đang đăng ký...' : (cooldown>0 ? `Thử lại sau ${cooldown}s` : 'Đăng ký')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
