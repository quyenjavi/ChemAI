'use client'
import { useEffect, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/components/AuthProvider'

type SchoolSuggestion = {
  id: string
  name: string
  status: string | null
  city_id: string
}

type PublishedExam = {
  id: string
  title: string
  exam_date: string | null
  published_at: string | null
}

function isBadSchoolName(input: string) {
  const t = String(input || '').trim().toLowerCase()
  if (t.length < 5) return true
  if (/^(a+|1+|0+)$/.test(t)) return true
  if (t === 'test' || t === 'testing') return true
  if (/^\d+$/.test(t)) return true
  return false
}

export default function ProfilePage() {
  const [fullName, setFullName] = useState('')
  const [cities, setCities] = useState<Array<{id:string,name:string}>>([])
  const [schoolInput, setSchoolInput] = useState('')
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null)
  const [schoolSuggestions, setSchoolSuggestions] = useState<SchoolSuggestion[]>([])
  const [schoolLoading, setSchoolLoading] = useState(false)
  const [grades, setGrades] = useState<Array<{id:string,name:string}>>([])
  const [classes, setClasses] = useState<Array<{id:string,name:string}>>([])
  const [academicYears, setAcademicYears] = useState<Array<{id:string,name:string}>>([])
  const [cityId, setCityId] = useState<string | ''>('')
  const [schoolId, setSchoolId] = useState<string | ''>('')
  const [gradeId, setGradeId] = useState<string | ''>('')
  const [classId, setClassId] = useState<string | ''>('')
  const [academicYearId, setAcademicYearId] = useState<string | null>(null)
  const [className, setClassName] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const [publishedExams, setPublishedExams] = useState<PublishedExam[]>([])
  const [publishedLoading, setPublishedLoading] = useState(false)
  const [publishedError, setPublishedError] = useState('')
  const [studentCodeByExamId, setStudentCodeByExamId] = useState<Record<string, string>>({})
  const [claimLoadingByExamId, setClaimLoadingByExamId] = useState<Record<string, boolean>>({})
  const [claimResultByExamId, setClaimResultByExamId] = useState<Record<string, any>>({})
  const [interestSelected, setInterestSelected] = useState<Record<string, boolean>>({})
  const [interestSaving, setInterestSaving] = useState<Record<string, boolean>>({})
  const [interestFeedback, setInterestFeedback] = useState('')
  const [interestOtherText, setInterestOtherText] = useState('')

  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const metaFullName = (user as any)?.user_metadata?.full_name ? String((user as any).user_metadata.full_name) : ''
  const claimStorageKey = user?.id ? `chemAI_claim_results_${user.id}` : ''

  useEffect(() => {
    if (authLoading) return
    if (!user?.id) {
      router.push('/login')
      return
    }
    let cancelled = false
    ;(async () => {
      const { data: existing } = await supabaseBrowser
        .from('student_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()
      if (cancelled) return
      if (existing) {
        setFullName(existing.full_name || '')
        setBirthDate(existing.birth_date || '')
        setSchoolId(existing.school_id || '')
        setGradeId(existing.grade_id || '')
        setClassId(existing.class_id || '')
        setAcademicYearId(existing.academic_year_id || null)
      }
      if (!existing?.full_name) {
        if (metaFullName) setFullName(metaFullName)
      }
      const [{ data: cityList }, { data: gr }, { data: ayList }] = await Promise.all([
        supabaseBrowser.from('cities').select('id,name').order('name', { ascending: true }),
        supabaseBrowser.from('grades').select('id,name').order('name', { ascending: true }),
        supabaseBrowser.from('academic_years').select('id,name').order('name', { ascending: false }).limit(20)
      ])
      if (cancelled) return
      setCities(cityList || [])
      setGrades((gr || []).filter(g => ['10', '11', '12'].includes(String(g.name))))
      setAcademicYears(ayList || [])

      const derivedCityId = await (async () => {
        if (existing?.school_id) {
          const { data: sch } = await supabaseBrowser.from('schools').select('city_id').eq('id', existing.school_id).maybeSingle()
          return sch?.city_id ? String(sch.city_id) : null
        }
        const dn = (cityList || []).find(c => c.name === 'Đà Nẵng') || null
        return dn?.id ? String(dn.id) : ((cityList || [])[0]?.id ? String((cityList || [])[0].id) : null)
      })()
      if (cancelled) return
      if (derivedCityId) setCityId(derivedCityId)

      const selectedCityId = derivedCityId
      if (existing?.school_id) {
        const { data: sch } = await supabaseBrowser.from('schools').select('id,name').eq('id', existing.school_id).maybeSingle()
        if (cancelled) return
        if (sch?.id) {
          setSelectedSchoolId(String(sch.id))
          setSchoolInput(String(sch.name || ''))
        }
      } else {
        setSelectedSchoolId(null)
        setSchoolInput('')
      }

      if (!existing?.academic_year_id) {
        const now2 = new Date()
        const y2 = now2.getFullYear()
        const m2 = now2.getMonth() + 1
        const d2 = now2.getDate()
        const label = (m2 > 7 || (m2 === 7 && d2 >= 1)) ? `${y2}-${y2+1}` : `${y2-1}-${y2}`
        const ay = (ayList || []).find((x: any) => x.name === label) || null
        if (ay?.id) setAcademicYearId(String(ay.id))
      }
    })()
    return () => { cancelled = true }
  }, [authLoading, metaFullName, router, user?.id])

  useEffect(() => {
    if (!schoolId) return
    if (schoolInput.trim()) return
    let cancelled = false
    ;(async () => {
      const { data: sch } = await supabaseBrowser.from('schools').select('id,name').eq('id', schoolId).maybeSingle()
      if (cancelled) return
      if (sch?.id) {
        setSelectedSchoolId(String(sch.id))
        setSchoolInput(String(sch.name || ''))
      }
    })()
    return () => { cancelled = true }
  }, [schoolId, schoolInput])

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
          return
        }
        setSchoolSuggestions(Array.isArray(j.schools) ? j.schools : [])
      } finally {
        setSchoolLoading(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [cityId, schoolInput])

  useEffect(() => {
    if (authLoading || !user?.id) return
    let cancelled = false
    ;(async () => {
      setPublishedLoading(true)
      setPublishedError('')
      try {
        const res = await fetch('/api/student/official-exams/published', { credentials: 'include' })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'Không thể tải danh sách kì thi')
        if (cancelled) return
        setPublishedExams(Array.isArray(json.items) ? json.items : [])
      } catch (e: any) {
        if (cancelled) return
        setPublishedError(e.message || 'Có lỗi xảy ra')
      } finally {
        if (cancelled) return
        setPublishedLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [authLoading, user?.id])

  useEffect(() => {
    if (!claimStorageKey) return
    try {
      const raw = localStorage.getItem(claimStorageKey) || ''
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        setClaimResultByExamId(parsed as any)
      }
    } catch {}
  }, [claimStorageKey])

  async function claimExam(examId: string) {
    const student_code = (studentCodeByExamId[examId] || '').trim()
    if (!student_code) {
      setClaimResultByExamId(prev => ({ ...prev, [examId]: { error: 'Vui lòng nhập SBD (student_code)' } }))
      return
    }
    setClaimLoadingByExamId(prev => ({ ...prev, [examId]: true }))
    setClaimResultByExamId(prev => ({ ...prev, [examId]: null }))
    try {
      const res = await fetch('/api/student/official-exams/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ exam_id: examId, student_code })
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Claim thất bại')
      setClaimResultByExamId(prev => {
        const next = { ...prev, [examId]: json }
        if (claimStorageKey) {
          try { localStorage.setItem(claimStorageKey, JSON.stringify(next)) } catch {}
        }
        return next
      })
    } catch (e: any) {
      setClaimResultByExamId(prev => ({ ...prev, [examId]: { error: e.message || 'Có lỗi xảy ra' } }))
    } finally {
      setClaimLoadingByExamId(prev => ({ ...prev, [examId]: false }))
    }
  }

  const anyClaimLoading = Object.values(claimLoadingByExamId).some(Boolean)

  const toggleInterest = async (subject: 'english' | 'math' | 'physics') => {
    setInterestSelected(prev => ({ ...prev, [subject]: !prev[subject] }))
    setInterestSaving(prev => ({ ...prev, [subject]: true }))
    setInterestFeedback('')
    try {
      const res = await fetch('/api/user-interests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ subject })
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        setInterestFeedback(String(j.error || 'Không thể lưu lựa chọn, vui lòng thử lại.'))
        return
      }
      setInterestFeedback('Đã ghi nhận! ChemAI sẽ gửi nội dung hữu ích sau.')
    } finally {
      setInterestSaving(prev => ({ ...prev, [subject]: false }))
    }
  }

  const saveOtherInterest = async () => {
    const text = String(interestOtherText || '').trim()
    if (!text) return
    setInterestSelected(prev => ({ ...prev, other: true }))
    setInterestSaving(prev => ({ ...prev, other: true }))
    setInterestFeedback('')
    try {
      const res = await fetch('/api/user-interests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ subject: 'other', other_text: text })
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        setInterestFeedback(String(j.error || 'Không thể lưu lựa chọn, vui lòng thử lại.'))
        return
      }
      setInterestFeedback('Đã ghi nhận! ChemAI sẽ gửi nội dung hữu ích sau.')
    } finally {
      setInterestSaving(prev => ({ ...prev, other: false }))
    }
  }

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
    if (schoolInput.trim() && isBadSchoolName(schoolInput) && !selectedSchoolId) {
      setError('Tên trường không hợp lệ (tối thiểu 5 ký tự, không dùng tên vô nghĩa)')
      return
    }
    setLoading(true)
    setError('')
    const res = await fetch('/api/profile/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: fullName,
        city_id: cityId || null,
        school_input: schoolInput.trim() || null,
        selected_school_id: selectedSchoolId || null,
        school_id: schoolId || null,
        grade_id: gradeId || null,
        class_id: classId || null,
        class_name: className || null,
        academic_year_id: academicYearId || null,
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
    <div className="space-y-4 max-w-5xl">
      {anyClaimLoading ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <div className="w-full max-w-lg border rounded-2xl p-6 bg-[var(--bg)] space-y-5" style={{borderColor:'var(--divider)'}}>
            <div className="space-y-2">
              <div className="text-xl font-semibold">Đang xử lý bài làm…</div>
              <div className="text-sm" style={{color:'var(--text-secondary)'}}>
                Vui lòng đợi một chút, ChemAI đang nhận bài và tổng hợp kết quả.
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-base font-semibold">Trong lúc chờ... em muốn học thêm môn gì?</div>
              <div className="text-sm" style={{color:'var(--text-secondary)'}}>ChemAI có thể gửi tài liệu phù hợp sau.</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Button
                  variant={interestSelected.english ? 'default' : 'outline'}
                  size="lg"
                  disabled={!!interestSaving.english}
                  onClick={() => toggleInterest('english')}
                  className="w-full"
                >
                  Tiếng Anh
                </Button>
                <Button
                  variant={interestSelected.math ? 'default' : 'outline'}
                  size="lg"
                  disabled={!!interestSaving.math}
                  onClick={() => toggleInterest('math')}
                  className="w-full"
                >
                  Toán
                </Button>
                <Button
                  variant={interestSelected.physics ? 'default' : 'outline'}
                  size="lg"
                  disabled={!!interestSaving.physics}
                  onClick={() => toggleInterest('physics')}
                  className="w-full"
                >
                  Vật lý
                </Button>
                <Button
                  variant={interestSelected.other ? 'default' : 'outline'}
                  size="lg"
                  disabled={!!interestSaving.other}
                  onClick={() => setInterestSelected(prev => ({ ...prev, other: !prev.other }))}
                  className="w-full"
                >
                  Khác
                </Button>
              </div>
              {interestSelected.other ? (
                <div className="flex gap-2 items-center">
                  <Input
                    value={interestOtherText}
                    onChange={(e) => setInterestOtherText(e.target.value)}
                    placeholder="Môn khác (VD: Sinh học)"
                  />
                  <Button
                    variant="outline"
                    disabled={!!interestSaving.other || !String(interestOtherText || '').trim()}
                    onClick={saveOtherInterest}
                  >
                    Lưu
                  </Button>
                </div>
              ) : null}
              {interestFeedback ? (
                <div className="text-sm" style={{ color: interestFeedback.includes('không thể') ? 'var(--danger)' : 'var(--success)' }}>
                  {interestFeedback}
                </div>
              ) : null}
            </div>

            <div className="p-4 rounded-xl border bg-white/5" style={{ borderColor: 'var(--divider)' }}>
              <div className="text-sm font-semibold">Đợi xíu nhé, bài của bạn đang load…</div>
              <div className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                Trong lúc chờ, vào follow Facebook ChemAI ngay nè:
              </div>
              <div className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                Top 10 kỳ thi năm nay sắp lộ diện!
              </div>
              <a
                className="mt-2 inline-flex items-center justify-center text-sm px-4 py-2.5 rounded-md border border-slate-200/25 bg-white/10 hover:bg-white/20 transition w-full"
                href="https://www.facebook.com/profile.php?id=61578453523740"
                target="_blank"
                rel="noreferrer"
              >
                Follow Facebook ChemAI
              </a>
            </div>

            <div className="space-y-3">
              <div className="h-2 w-full rounded bg-slate-700/40 overflow-hidden">
                <div className="h-full w-1/2 bg-violet-500/70 animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <h1 className="text-2xl font-semibold">Hồ sơ</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        <Card>
          <CardHeader>
            <CardTitle>Kì thi trường (Official Exam)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {publishedLoading ? <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Đang tải…</div> : null}
            {publishedError ? <div className="text-sm text-red-600">{publishedError}</div> : null}
            {!publishedLoading && !publishedExams.length ? (
              <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Chưa có kì thi nào được publish.</div>
            ) : (
              <div className="space-y-3">
                {publishedExams.map((ex) => {
                  const claimRes = claimResultByExamId[ex.id] || null
                  const claimErr = claimRes?.error ? String(claimRes.error) : ''
                  const attemptRaw = claimRes?.attempt?.raw_score ?? null
                  const attemptTotal = claimRes?.attempt?.total_score ?? null
                  const score = attemptRaw ?? (claimRes?.result?.score ?? null)
                  const imageUrl = claimRes?.result?.image_url ?? claimRes?.attempt?.paper_image_url ?? null
                  const attemptUrl = claimRes?.attempt?.url ?? null
                  return (
                    <div key={ex.id} className="border rounded p-3 space-y-2 bg-orange-500/5" style={{ borderColor: 'rgba(251,146,60,0.45)' }}>
                      <div className="font-semibold whitespace-normal break-words">{ex.title || ex.id}</div>
                      <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                        {ex.exam_date ? <>Ngày thi: <span style={{ color: 'var(--text)' }}>{new Date(ex.exam_date).toLocaleDateString()}</span></> : null}
                        {ex.published_at ? <> · Published: <span style={{ color: 'var(--text)' }}>{new Date(ex.published_at).toLocaleString()}</span></> : null}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                        <div className="sm:col-span-2">
                          <div className="text-sm">SBD (7 chữ số)</div>
                          <Input
                            value={studentCodeByExamId[ex.id] || ''}
                            onChange={(e) => setStudentCodeByExamId(prev => ({ ...prev, [ex.id]: e.target.value }))}
                            placeholder="Nhập SBD 7 chữ số để claim"
                          />
                        </div>
                        <Button disabled={!!claimLoadingByExamId[ex.id]} onClick={() => claimExam(ex.id)}>
                          {claimLoadingByExamId[ex.id] ? 'Đang claim…' : 'Claim'}
                        </Button>
                      </div>
                      {claimErr ? <div className="text-sm text-red-600">{claimErr}</div> : null}
                      {claimRes && !claimErr ? (
                        <div className="text-sm">
                          <div>
                            Kết quả:{' '}
                            <b>
                              {attemptRaw != null && attemptTotal != null
                                ? `${String(attemptRaw)} / ${String(attemptTotal)}`
                                : (score == null ? '—' : String(score))}
                            </b>
                          </div>
                          <div className="flex gap-3 flex-wrap">
                            {imageUrl ? <a className="underline" href={String(imageUrl)} target="_blank" rel="noreferrer">Xem ảnh bài làm</a> : null}
                            {attemptUrl ? <a className="underline" href={String(attemptUrl)}>Xem bài làm trên ChemAI</a> : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Thông tin</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-3">
              <Input placeholder="Họ tên" value={fullName} onChange={e=>setFullName(e.target.value)} />
              <div>
                <label className="text-sm">Thành phố</label>
                <select className="w-full mt-1 border rounded p-2 bg-transparent select-clean" value={cityId} onChange={e=>{ setCityId(e.target.value); setSchoolInput(''); setSelectedSchoolId(null); setSchoolId(''); setSchoolSuggestions([]); setClassId(''); setClassName('') }} disabled={!cities.length}>
                  <option value="" disabled>Chọn thành phố</option>
                  {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm">Trường</label>
                <div className="relative mt-1">
                  <Input
                    placeholder={cityId ? 'Nhập tên trường...' : 'Chọn thành phố trước'}
                    value={schoolInput}
                    onChange={(e) => {
                      setSchoolInput(e.target.value)
                      setSelectedSchoolId(null)
                      setSchoolId('')
                    }}
                    disabled={!cityId}
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
                              setSelectedSchoolId(String(s.id))
                              setSchoolId(String(s.id))
                              setSchoolInput(String(s.name || ''))
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
                          setSchoolId('')
                          setSchoolSuggestions([])
                        }}
                        disabled={isBadSchoolName(schoolInput)}
                        title={isBadSchoolName(schoolInput) ? 'Tên trường tối thiểu 5 ký tự và không dùng tên vô nghĩa' : undefined}
                      >
                        + Thêm trường mới: “{schoolInput.trim()}”
                      </button>
                    )}
                  </div>
                ) : null}
                {isBadSchoolName(schoolInput) && schoolInput.trim().length > 0 ? (
                  <div className="text-xs mt-1 text-red-400">Tên trường không hợp lệ (tối thiểu 5 ký tự, không dùng tên vô nghĩa)</div>
                ) : null}
              </div>
              <div>
                <label className="text-sm">Khối</label>
                <select className="w-full mt-1 border rounded p-2 bg-transparent select-clean" value={gradeId} onChange={e=>{ setGradeId(e.target.value); setClassId(''); setClassName('') }} disabled={!grades.length}>
                  <option value="" disabled>Chọn khối</option>
                  {grades.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm">Lớp</label>
                <Input
                  list="class-options"
                  placeholder="VD: 10.1"
                  value={className}
                  onChange={(e) => {
                    const v = e.target.value
                    setClassName(v)
                    const found = classes.find(c => String(c.name) === String(v))
                    setClassId(found ? String(found.id) : '')
                  }}
                  disabled={!(gradeId && academicYearId && (schoolId || selectedSchoolId || schoolInput.trim()))}
                />
                <datalist id="class-options">
                  {classes.map(c => <option key={c.id} value={c.name} />)}
                </datalist>
              </div>
              <div>
                <label className="text-sm">Năm học</label>
                <select className="w-full mt-1 border rounded p-2 bg-transparent select-clean" value={academicYearId || ''} onChange={e=>{ setAcademicYearId(e.target.value || null); setClassId(''); setClassName('') }} disabled={!academicYears.length}>
                  <option value="" disabled>Chọn năm học</option>
                  {academicYears.map(ay => <option key={ay.id} value={ay.id}>{ay.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm">Ngày sinh</label>
                <Input className="mt-1" placeholder="Ngày sinh" type="date" value={birthDate} onChange={e=>setBirthDate(e.target.value)} />
              </div>
              {error ? <div className="text-red-600 text-sm">{error}</div> : null}
              <Button disabled={loading}>
                {loading ? 'Đang lưu...' : 'Lưu hồ sơ'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
