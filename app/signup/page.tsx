'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

type SchoolSuggestion = {
  id: string
  name: string
  status: string | null
  city_id: string
}

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [fullName, setFullName] = useState('')
  const [cities, setCities] = useState<Array<{id:string,name:string}>>([])
  const [cityId, setCityId] = useState<string | ''>('')
  const [schoolInput, setSchoolInput] = useState('')
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null)
  const [schoolSuggestions, setSchoolSuggestions] = useState<SchoolSuggestion[]>([])
  const [schoolLoading, setSchoolLoading] = useState(false)
  const [grades, setGrades] = useState<Array<{id:string,name:string}>>([])
  const [gradeId, setGradeId] = useState<string | ''>('')
  const [className, setClassName] = useState<string | ''>('')
  const [academicYearId, setAcademicYearId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [showPass, setShowPass] = useState(false)
  const [showPass2, setShowPass2] = useState(false)
  const router = useRouter()

  const isBadSchoolName = (input: string) => {
    const t = String(input || '').trim().toLowerCase()
    if (t.length < 5) return true
    if (/^(a+|1+|0+)$/.test(t)) return true
    if (t === 'test' || t === 'testing') return true
    if (/^\d+$/.test(t)) return true
    return false
  }

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  const passLenOk = password.length >= 8
  const passMatch = password === password2
  const formValid = !!(
    fullName &&
    emailValid &&
    passLenOk &&
    passMatch &&
    cityId &&
    schoolInput.trim() &&
    !isBadSchoolName(schoolInput) &&
    gradeId &&
    className
  )

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
      const { data: cityList } = await supabaseBrowser.from('cities').select('id,name').order('name', { ascending: true })
      setCities(cityList || [])
      const defaultCity = (cityList || []).find(c => c.name === 'Đà Nẵng') || (cityList || [])[0]
      setCityId(defaultCity?.id || '')
      const { data: gr } = await supabaseBrowser.from('grades').select('id,name').order('name', { ascending: true })
      setGrades((gr || []).filter(g => ['10','11','12'].includes(String(g.name))))
      const label = computeAcademicYearLabel(new Date())
      const { data: ay } = await supabaseBrowser.from('academic_years').select('id,name').eq('name', label).maybeSingle()
      setAcademicYearId(ay?.id || null)
    }
    init()
  }, [])

  useEffect(() => {
    setSchoolInput('')
    setSelectedSchoolId(null)
    setSchoolSuggestions([])
    setGradeId('')
    setClassName('')
  }, [cityId])

  useEffect(() => {
    if (!cityId || schoolInput.trim().length < 2) {
      setSchoolSuggestions([])
      return
    }
    const t = setTimeout(async () => {
      setSchoolLoading(true)
      try {
        const url = `/api/schools/search?city_id=${encodeURIComponent(cityId)}&keyword=${encodeURIComponent(schoolInput)}`
        const r = await fetch(url)
        const j = await r.json().catch(() => ({}))
        if (!r.ok) {
          setSchoolSuggestions([])
          setError(j.error || 'Không thể tìm trường')
          return
        }
        setError('')
        setSchoolSuggestions(Array.isArray(j.schools) ? j.schools : [])
      } finally {
        setSchoolLoading(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [cityId, schoolInput])

  const classOptions = useMemo(() => {
    const g = grades.find(x => x.id === gradeId)?.name
    const gName = String(g || '').trim()
    const list: string[] = []
    if (!gName) return list
    for (let i = 0; i <= 17; i++) list.push(`${gName}.${i}`)
    return list
  }, [gradeId, grades])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (cooldown > 0) return
    setLoading(true)
    setError('')
    if (!formValid) {
      setLoading(false)
      if (!passLenOk) {
        setError('Mật khẩu phải có ít nhất 8 ký tự')
      } else if (!emailValid) {
        setError('Email không hợp lệ')
      } else if (!passMatch) {
        setError('Mật khẩu nhập lại không khớp')
      } else if (isBadSchoolName(schoolInput)) {
        setError('Tên trường không hợp lệ (tối thiểu 5 ký tự, không dùng tên vô nghĩa)')
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
    const r = await fetch('/api/auth/instant-signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        full_name: fullName,
        city_id: cityId,
        school_input: schoolInput,
        selected_school_id: selectedSchoolId || undefined,
        grade_id: gradeId,
        class_name: className,
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
          <div className="relative">
            <Input placeholder="Mật khẩu" type={showPass ? 'text' : 'password'} value={password} onChange={e=>setPassword(e.target.value)} required />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-sm opacity-70 hover:opacity-100"
              onClick={() => setShowPass(s => !s)}
              aria-label={showPass ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            >
              {showPass ? '🙈' : '👁️'}
            </button>
          </div>
          {!passLenOk ? <div className="text-red-600 text-xs">Mật khẩu phải có ít nhất 8 ký tự</div> : null}
          <div className="relative">
            <Input placeholder="Nhập lại mật khẩu" type={showPass2 ? 'text' : 'password'} value={password2} onChange={e=>setPassword2(e.target.value)} required />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-sm opacity-70 hover:opacity-100"
              onClick={() => setShowPass2(s => !s)}
              aria-label={showPass2 ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            >
              {showPass2 ? '🙈' : '👁️'}
            </button>
          </div>
          {passLenOk && !passMatch ? <div className="text-red-600 text-xs">Mật khẩu nhập lại không khớp</div> : null}
          <div>
            <label className="text-sm">Thành phố</label>
            <select className="w-full mt-1 border rounded p-2 bg-transparent select-clean" value={cityId} onChange={e=>setCityId(e.target.value)} disabled={!cities.length} required>
              <option value="" disabled>Chọn thành phố</option>
              {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm">Trường</label>
            <div className="relative">
              <Input
                placeholder={cityId ? 'Nhập tên trường...' : 'Chọn thành phố trước'}
                value={schoolInput}
                onChange={(e) => {
                  setSchoolInput(e.target.value)
                  setSelectedSchoolId(null)
                }}
                disabled={!cityId}
                required
              />
              {schoolLoading ? <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs opacity-70">...</div> : null}
            </div>
            {cityId && schoolInput.trim().length >= 2 ? (
              <div className="mt-2 border rounded overflow-hidden" style={{borderColor:'var(--divider)'}}>
                {schoolSuggestions.length ? (
                  <div className="max-h-56 overflow-y-auto">
                    {schoolSuggestions.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-900/10 flex items-center justify-between gap-3"
                        onClick={() => {
                          setSelectedSchoolId(s.id)
                          setSchoolInput(s.name)
                          setSchoolSuggestions([])
                        }}
                      >
                        <span>{s.name}</span>
                        <span className="text-xs opacity-70">{s.status === 'active' ? '' : '(đang xác minh)'}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-900/10"
                    onClick={() => {
                      setSelectedSchoolId(null)
                      setSchoolSuggestions([])
                    }}
                  >
                    + Thêm trường mới: “{schoolInput.trim()}”
                  </button>
                )}
              </div>
            ) : null}
          </div>
          <div>
            <label className="text-sm">Khối</label>
            <select className="w-full mt-1 border rounded p-2 bg-transparent select-clean" value={gradeId} onChange={e=>{ setGradeId(e.target.value); setClassName('') }} disabled={!grades.length} required>
              <option value="" disabled>Chọn khối</option>
              {grades.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm">Lớp</label>
            <select className="w-full mt-1 border rounded p-2 bg-transparent select-clean" value={className} onChange={e=>setClassName(e.target.value)} disabled={!gradeId} required>
              <option value="" disabled>Chọn lớp</option>
              {classOptions.map(n => <option key={n} value={n}>{n}</option>)}
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
