'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabaseBrowser } from '@/lib/supabase/client'

function normalizeText(v: any) {
  return String(v ?? '').trim()
}

function academicYearLabel(d: Date) {
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const day = d.getDate()
  return (m > 7 || (m === 7 && day >= 1)) ? `${y}-${y + 1}` : `${y - 1}-${y}`
}

function canShowProfilePrompt() {
  try {
    const raw = localStorage.getItem('chemAI_profile_prompt_last') || ''
    const last = raw ? Number(raw) : 0
    if (!last) return true
    return (Date.now() - last) > 24 * 60 * 60 * 1000
  } catch {
    return true
  }
}

function markProfilePromptShown() {
  try {
    localStorage.setItem('chemAI_profile_prompt_last', String(Date.now()))
  } catch {}
}

function isBadSchoolName(input: string) {
  const t = String(input || '').trim().toLowerCase()
  if (t.length < 5) return true
  if (/^(a+|1+|0+)$/.test(t)) return true
  if (t === 'test' || t === 'testing') return true
  if (/^\d+$/.test(t)) return true
  return false
}

function ProfileCompletionPrompt({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [cities, setCities] = useState<Array<{ id: string, name: string }>>([])
  const [schoolInput, setSchoolInput] = useState('')
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null)
  const [schoolSuggestions, setSchoolSuggestions] = useState<Array<{ id: string, name: string, status: string | null, city_id: string }>>([])
  const [schoolLoading, setSchoolLoading] = useState(false)
  const [grades, setGrades] = useState<Array<{ id: string, name: string }>>([])
  const [classes, setClasses] = useState<Array<{ id: string, name: string }>>([])
  const [cityId, setCityId] = useState('')
  const [schoolId, setSchoolId] = useState('')
  const [gradeId, setGradeId] = useState('')
  const [academicYearId, setAcademicYearId] = useState<string | null>(null)
  const [className, setClassName] = useState('')

  useEffect(() => {
    if (!enabled) return
    if (!canShowProfilePrompt()) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const { data: auth } = await supabaseBrowser.auth.getUser()
        const u = auth?.user
        if (!u?.id) return

        const [{ data: cityList }, { data: gradeList }, { data: ayList }] = await Promise.all([
          supabaseBrowser.from('cities').select('id,name').order('name', { ascending: true }),
          supabaseBrowser.from('grades').select('id,name').order('name', { ascending: true }),
          supabaseBrowser.from('academic_years').select('id,name').eq('name', academicYearLabel(new Date())).limit(1),
        ])
        if (cancelled) return
        setCities((cityList || []).map((c: any) => ({ id: String(c.id), name: String(c.name || '') })))
        setGrades((gradeList || []).filter((g: any) => ['10', '11', '12'].includes(String(g.name))).map((g: any) => ({ id: String(g.id), name: String(g.name || '') })))
        setAcademicYearId((ayList || [])[0]?.id ? String((ayList || [])[0].id) : null)

        const { data: profile } = await supabaseBrowser
          .from('student_profiles')
          .select('school_id, grade_id, class_id, academic_year_id')
          .eq('user_id', u.id)
          .maybeSingle()
        if (cancelled) return

        const classId = profile?.class_id ? String(profile.class_id) : ''
        const schId = profile?.school_id ? String(profile.school_id) : ''
        const gId = profile?.grade_id ? String(profile.grade_id) : ''
        const ayId = profile?.academic_year_id ? String(profile.academic_year_id) : (ayList || [])[0]?.id ? String((ayList || [])[0].id) : null
        setSchoolId(schId)
        setSelectedSchoolId(schId || null)
        setGradeId(gId)
        setAcademicYearId(ayId)

        let currentClassName = ''
        if (classId) {
          const { data: cls } = await supabaseBrowser.from('classes').select('name').eq('id', classId).maybeSingle()
          currentClassName = cls?.name ? String(cls.name) : ''
          setClassName(currentClassName)
        }

        let schCityId = ''
        if (schId) {
          const { data: sch } = await supabaseBrowser.from('schools').select('city_id,name').eq('id', schId).maybeSingle()
          schCityId = sch?.city_id ? String(sch.city_id) : ''
          if (sch?.name) setSchoolInput(String(sch.name))
        }
        const dn = (cityList || []).find((c: any) => c.name === 'Đà Nẵng')
        const nextCityId = schCityId || (dn?.id ? String(dn.id) : ((cityList || [])[0]?.id ? String((cityList || [])[0].id) : ''))
        setCityId(nextCityId)

        const incomplete = !schId || !gId || !classId || currentClassName === '10.0'
        if (incomplete) setOpen(true)
      } finally {
        if (cancelled) return
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [enabled])

  useEffect(() => {
    if (!open) return
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
  }, [cityId, open, schoolInput])

  useEffect(() => {
    if (!open) return
    if (!(schoolId && gradeId && academicYearId)) { setClasses([]); return }
    let cancelled = false
    ;(async () => {
      const { data } = await supabaseBrowser
        .from('classes')
        .select('id,name')
        .eq('school_id', schoolId)
        .eq('grade_id', gradeId)
        .eq('academic_year_id', academicYearId)
        .order('name', { ascending: true })
      if (cancelled) return
      setClasses((data || []).map((c: any) => ({ id: String(c.id), name: String(c.name || '') })))
    })()
    return () => { cancelled = true }
  }, [academicYearId, gradeId, open, schoolId])

  const close = () => {
    markProfilePromptShown()
    setOpen(false)
  }

  const next = () => setStep(s => Math.min(3, s + 1))
  const prev = () => setStep(s => Math.max(0, s - 1))

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      if (!schoolId && schoolInput.trim() && isBadSchoolName(schoolInput) && !selectedSchoolId) {
        throw new Error('Tên trường không hợp lệ')
      }
      const res = await fetch('/api/profile/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city_id: cityId || null,
          school_input: schoolInput.trim() || null,
          selected_school_id: selectedSchoolId || null,
          school_id: schoolId || null,
          grade_id: gradeId || null,
          academic_year_id: academicYearId || null,
          class_name: className || null
        })
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Không thể lưu hồ sơ')
      close()
    } catch (e: any) {
      setError(e.message || 'Có lỗi xảy ra')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center px-4" onClick={close}>
      <div className="w-full max-w-md border rounded-2xl bg-[var(--card)]" style={{ borderColor: 'var(--divider)' }} onClick={(e) => e.stopPropagation()}>
        <div className="p-5 space-y-2 border-b" style={{ borderColor: 'var(--divider)' }}>
          <div className="text-lg font-semibold">Bạn đang học ở đâu để ChemAI gợi ý chính xác hơn?</div>
          <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Có thể cập nhật nhanh, hoặc để sau.</div>
        </div>
        <div className="p-5 space-y-4">
          {loading ? <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Đang tải…</div> : null}
          {!loading ? (
            <>
              {step === 0 ? (
                <div className="space-y-2">
                  <div className="text-sm font-semibold">1. Thành phố nào?</div>
                  <select
                    className="w-full border rounded-xl px-3 py-2 bg-transparent"
                    style={{ borderColor: 'var(--divider)' }}
                    value={cityId}
                    onChange={(e) => {
                      setCityId(e.target.value)
                      setSchoolId('')
                      setSchoolInput('')
                      setSelectedSchoolId(null)
                      setSchoolSuggestions([])
                      setClassName('')
                    }}
                  >
                    <option value="" disabled>Chọn thành phố</option>
                    {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              ) : null}
              {step === 1 ? (
                <div className="space-y-2">
                  <div className="text-sm font-semibold">2. Trường nào?</div>
                  <div className="relative">
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
                    <div className="border rounded overflow-hidden" style={{ borderColor: 'var(--divider)' }}>
                      {schoolSuggestions.length ? (
                        <div className="max-h-56 overflow-y-auto">
                          {schoolSuggestions.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-900/10 flex items-center justify-between gap-3"
                              onClick={() => {
                                setSelectedSchoolId(String(s.id))
                                setSchoolId(String(s.id))
                                setSchoolInput(String(s.name || ''))
                                setSchoolSuggestions([])
                                setClassName('')
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
                            setClassName('')
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
                    <div className="text-xs text-red-400">Tên trường không hợp lệ (tối thiểu 5 ký tự, không dùng tên vô nghĩa)</div>
                  ) : null}
                </div>
              ) : null}
              {step === 2 ? (
                <div className="space-y-2">
                  <div className="text-sm font-semibold">3. Khối nào?</div>
                  <select className="w-full border rounded-xl px-3 py-2 bg-transparent" style={{ borderColor: 'var(--divider)' }} value={gradeId} onChange={(e) => { setGradeId(e.target.value); setClassName(''); }}>
                    <option value="" disabled>Chọn khối</option>
                    {grades.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
              ) : null}
              {step === 3 ? (
                <div className="space-y-2">
                  <div className="text-sm font-semibold">4. Lớp nào?</div>
                  <Input list="prompt-class-options" placeholder="VD: 10.1" value={className} onChange={(e) => setClassName(e.target.value)} />
                  <datalist id="prompt-class-options">
                    {classes.map(c => <option key={c.id} value={c.name} />)}
                  </datalist>
                </div>
              ) : null}
              {error ? <div className="text-sm text-red-400">{error}</div> : null}
            </>
          ) : null}
        </div>
        <div className="p-5 flex items-center justify-between gap-2 border-t" style={{ borderColor: 'var(--divider)' }}>
          <Button variant="ghost" onClick={close}>Để sau</Button>
          <div className="flex gap-2">
            {step > 0 ? <Button variant="outline" onClick={prev}>Quay lại</Button> : null}
            {step < 3 ? <Button onClick={next}>Tiếp</Button> : <Button disabled={saving} onClick={save}>{saving ? 'Đang lưu…' : 'Lưu'}</Button>}
          </div>
        </div>
      </div>
    </div>
  )
}

function ReportDialog({ answer, onReportSuccess }: { answer: AnyAnswer, onReportSuccess: (questionId: string, reportId: string) => void }) {
  const [isOpen, setIsOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [detail, setDetail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!reason) {
      setError('Vui lòng chọn lý do báo cáo.')
      return
    }
    setIsSubmitting(true)
    setError('')
    try {
      const res = await fetch(`/api/student/attempts/${(answer as any).attempt_id}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_id: answer.question_id,
          attempt_answer_id: (answer as any).answer_id,
          report_reason: reason,
          report_detail: detail,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Có lỗi xảy ra')
      onReportSuccess(answer.question_id, data.report_id)
      setIsOpen(false)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (answer.report_locked) {
    return <div className="text-xs text-yellow-400">Câu hỏi đã bị khóa báo cáo</div>
  }

  if (answer.report_id && answer.report_status !== 'rejected') {
    return <div className="text-xs text-green-400">Đã báo cáo ({answer.report_status})</div>
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setIsOpen(true)} className="text-xs">
        Báo cáo lỗi
      </Button>
      {isOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setIsOpen(false)}>
          <div className="bg-slate-800 p-6 rounded-lg w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Báo cáo lỗi câu hỏi</h3>
            <div className="space-y-4">
              <div className="text-sm text-slate-300">Câu hỏi: {answer.content}</div>
              <div>
                <label className="text-sm font-medium">Lý do báo cáo</label>
                <select
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  className="w-full mt-1 p-2 rounded bg-slate-700 border border-slate-600"
                >
                  <option value="">-- Chọn lý do --</option>
                  <option value="wrong_answer">Đáp án sai</option>
                  <option value="wrong_question">Nội dung câu hỏi sai/khó hiểu</option>
                  <option value="wrong_explanation">Giải thích sai</option>
                  <option value="other">Lỗi khác</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Chi tiết (nếu có)</label>
                <textarea
                  value={detail}
                  onChange={e => setDetail(e.target.value)}
                  className="w-full mt-1 p-2 rounded bg-slate-700 border border-slate-600 min-h-[100px]"
                  placeholder="Mô tả thêm về lỗi bạn phát hiện..."
                />
              </div>
              {error && <div className="text-red-400 text-sm">{error}</div>}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setIsOpen(false)} disabled={isSubmitting}>Hủy</Button>
                <Button onClick={handleSubmit} disabled={isSubmitting}>
                  {isSubmitting ? 'Đang gửi...' : 'Gửi báo cáo'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}


type AttemptInfo = {
  id: string
  lesson_id?: string | null
  lesson_title?: string | null
  lesson_type?: 'practice' | 'exam' | null
  created_at?: string | null
  mode: 'practice' | 'exam' | null
  status: string | null
  total_questions: number
  correct_answers: number
  score_percent: number
  raw_score: number
  total_score: number
  accuracy_correct_units: number
  accuracy_total_units: number
  accuracy_percent: number
}
type Feedback = {
  praise: string,
  strengths: string[],
  plan: string[],
}

type GradingStatement = {
  statement_id: string
  is_correct: boolean | null
  score_awarded: number | null
  max_score: number | null
  grading_method: string | null
  chosen?: string | null
  correct?: string | null
  explain?: string | null
  tip?: string | null
}

type GradingQuestionResult = {
  question_id: string
  question_type: string
  is_correct: boolean | null
  score_awarded: number | null
  max_score: number | null
  grading_method: string | null
  comment: string | null
  chosen?: string | null
  correct?: string | null
  explain?: string | null
  tip?: string | null
  sub_items?: GradingStatement[]
}

type Grading = {
  lesson_type: 'practice' | 'exam' | null
  raw_score: number | null
  total_score: number | null
  accuracy_correct_units: number | null
  accuracy_total_units: number | null
  accuracy_percent: number | null
  question_results: GradingQuestionResult[]
}

type AnswerBase = {
  question_id: string
  question_type: string
  content: string
  order_index: number
  topic?: string
  topic_unit?: string
  difficulty?: string | null
  difficulty_academic?: string | null
  explanation?: string
  tip?: string
  image_url?: string
  image_alt?: string
  image_caption?: string
  report_locked?: boolean
  report_id?: string | null
  report_status?: string | null
  attempt_id?: string | null
  answer_id?: string | null
}

type ChoiceAnswer = AnswerBase & {
  question_type: 'single_choice' | 'true_false'
  selected_answer?: string | null
  selected_text?: string | null
  correct_key?: string | null
  correct_text?: string | null
  is_correct?: boolean | null
  score_awarded?: number | null
  max_score?: number | null
  grading_method?: string | null
}

type ShortAnswer = AnswerBase & {
  question_type: 'short_answer'
  answer_text?: string | null
  reference_answers?: string[]
  is_correct?: boolean | null
  score_awarded?: number | null
  max_score?: number | null
  grading_method?: string | null
  ai_feedback?: string | null
}

type TFStatement = {
  statement_id: string
  text: string
  sort_order: number
  selected_answer: boolean | null
  correct_answer: boolean | null
  is_correct: boolean | null
  score_awarded: number | null
  max_score: number | null
  grading_method: string | null
  explanation?: string | null
  tip?: string | null
}

type TrueFalseGroupAnswer = AnswerBase & {
  question_type: 'true_false_group'
  statements?: TFStatement[]
}

type AnyAnswer = ChoiceAnswer | ShortAnswer | TrueFalseGroupAnswer | (AnswerBase & Record<string, any>)

type PracticeOption = { key: string, text: string, is_correct: boolean }
type PracticeStatement = { statement_id: string, key: string | null, text: string, correct_answer: boolean | null, explanation: string | null, tip: string | null, sort_order: number }
type PracticeShortAnswer = { text: string, explanation: string | null, tip: string | null }
type PracticeQuestion = {
  question_id: string
  content: string
  question_type: 'single_choice' | 'true_false' | 'true_false_group' | 'short_answer' | string
  topic: string | null
  topic_unit: string | null
  difficulty: string | null
  difficulty_academic: string | null
  tip: string | null
  explanation: string | null
  image_url: string | null
  image_alt: string | null
  image_caption: string | null
  options?: PracticeOption[]
  statements?: PracticeStatement[]
  accepted_answers?: PracticeShortAnswer[]
}

export default function ResultPage() {
  const params = useParams()
  const attemptId = (params as any)?.attemptId as string | undefined
  const [attempt, setAttempt] = useState<AttemptInfo | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [shortAnswerResults, setShortAnswerResults] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [answers, setAnswers] = useState<AnyAnswer[]>([])
  const [practiceOpen, setPracticeOpen] = useState(false)
  const [practiceTitle, setPracticeTitle] = useState('')
  const [practiceItems, setPracticeItems] = useState<PracticeQuestion[]>([])
  const [practiceLoading, setPracticeLoading] = useState(false)
  const [practiceError, setPracticeError] = useState('')
  const [practiceStateByQ, setPracticeStateByQ] = useState<Record<string, any>>({})

  const handleReportSuccess = (questionId: string, reportId: string) => {
    setAnswers(prev => prev.map(a => {
      if (a.question_id === questionId) {
        return { ...a, report_id: reportId, report_status: 'pending' }
      }
      return a
    }))
  }

  const saById = useMemo(() => {
    const m: Record<string, any> = {}
    for (const r of shortAnswerResults || []) {
      const qid = String((r as any)?.question_id || '').trim()
      if (!qid) continue
      m[qid] = r
    }
    return m
  }, [shortAnswerResults])

  const getTopicLabel = useCallback((q: AnyAnswer) => {
    const tu = String((q as any).topic_unit || '').trim()
    if (tu) return tu
    const t = String((q as any).topic || '').trim()
    return t || 'Chưa phân loại'
  }, [])

  const getFinalIsCorrect = useCallback((q: AnyAnswer): boolean | null => {
    if (q.question_type === 'true_false_group') {
      const v = (q as any).is_correct
      return typeof v === 'boolean' ? v : null
    }
    if (q.question_type === 'short_answer') {
      const qa = q as ShortAnswer
      const sa = saById[q.question_id]
      if (typeof qa.is_correct === 'boolean') return qa.is_correct
      if (typeof sa?.is_correct === 'boolean') return sa.is_correct
      return null
    }
    const v = (q as any).is_correct
    return typeof v === 'boolean' ? v : null
  }, [saById])

  const openPractice = async (payload: any, title: string) => {
    setPracticeOpen(true)
    setPracticeTitle(title)
    setPracticeItems([])
    setPracticeError('')
    setPracticeStateByQ({})
    setPracticeLoading(true)
    try {
      const excludeIds = answers.map(a => a.question_id).filter(Boolean)
      const res = await fetch('/api/questions/similar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 3, exclude_question_ids: excludeIds, ...payload }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Không thể lấy câu luyện tập')
      const items = Array.isArray(data?.items) ? (data.items as PracticeQuestion[]) : []
      setPracticeItems(items)
      if (!items.length) setPracticeError('Không tìm thấy câu hỏi phù hợp để luyện tập.')
    } catch (e: any) {
      setPracticeError(e.message || 'Có lỗi xảy ra')
    } finally {
      setPracticeLoading(false)
    }
  }

  const practiceButtonClass =
    'border border-fuchsia-400/90 text-fuchsia-50 bg-fuchsia-500/20 hover:bg-fuchsia-500/30 hover:border-fuchsia-300 font-semibold ring-1 ring-fuchsia-400/30 shadow-[0_0_0_1px_rgba(236,72,153,0.25),0_0_18px_rgba(236,72,153,0.20)]'

  const patchPracticeState = (questionId: string, patch: Record<string, any>) => {
    setPracticeStateByQ(prev => {
      const cur = prev[questionId] || {}
      return { ...prev, [questionId]: { ...cur, ...patch } }
    })
  }

  useEffect(() => {
    if (!attemptId) return
    ;(async () => {
      setLoading(true)
      const res = await fetch(`/api/attempts/${attemptId}/answers`, { credentials: 'include' })

      if (res.ok) {
        const j = await res.json()
        setAttempt(j.attempt || null)
        setAnswers(j.answers || [])
        setShortAnswerResults(Array.isArray(j?.report?.short_answer_results) ? j.report.short_answer_results : [])
        if (j.report?.feedback) {
          const uv = (v: any) => (v && typeof v === 'object' && 'value' in v) ? v.value : v
          const ua = (v: any) => {
            const r = uv(v)
            return Array.isArray(r) ? r : []
          }
          const f = j.report.feedback as any
          const sanitized = {
            praise: uv(f.praise) || '',
            strengths: ua(f.strengths),
            plan: ua(f.plan)
          } as Feedback
          setFeedback(sanitized)
        } else {
          setFeedback(null)
        }
      } else {
        setAttempt(null)
        setFeedback(null)
        setAnswers([])
        setShortAnswerResults([])
      }
      setLoading(false)
    })()
  }, [attemptId])

  const formatScore = (v: any) => {
    const n = Number(v)
    if (!Number.isFinite(n)) return '0'
    const s = (Math.round(n * 100) / 100).toFixed(2)
    return s.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
  }

  const formatDateTime = (v: any) => {
    if (!v) return ''
    const t = new Date(String(v))
    if (Number.isNaN(t.getTime())) return ''
    return t.toLocaleString()
  }

  const getMode = () => {
    if (attempt?.lesson_type === 'exam' || attempt?.lesson_type === 'practice') return attempt.lesson_type
    if (attempt?.mode === 'exam' || attempt?.mode === 'practice') return attempt.mode
    return null
  }

  const StatusBadge = ({ status }: { status: 'correct' | 'wrong' | 'partial' | 'pending' }) => {
    const cls = status === 'correct'
      ? 'text-emerald-200 bg-emerald-500/10 border-emerald-500/20'
      : status === 'wrong'
        ? 'text-rose-200 bg-rose-500/10 border-rose-500/20'
        : status === 'partial'
          ? 'text-amber-200 bg-amber-500/10 border-amber-500/20'
          : 'text-slate-200 bg-slate-800/40 border-slate-600'
    const label = status === 'correct' ? '✅ Đúng' : status === 'wrong' ? '❌ Sai' : status === 'partial' ? '⚠️ Một phần đúng' : 'Chưa chấm'
    return <span className={`text-xs px-2 py-1 rounded-md border ${cls}`}>{label}</span>
  }

  const SummaryStat = ({ label, value, tone }: { label: string, value: string, tone: 'neutral' | 'primary' | 'success' | 'error' }) => {
    const cls = tone === 'primary'
      ? 'border-blue-500/20 bg-blue-500/10 text-blue-100'
      : tone === 'success'
        ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-100'
        : tone === 'error'
          ? 'border-rose-500/20 bg-rose-500/10 text-rose-100'
          : 'border-slate-700/60 bg-slate-900/30 text-slate-100'
    return (
      <div className={`rounded-lg border p-4 ${cls}`}>
        <div className="text-xs text-slate-200/70">{label}</div>
        <div className="mt-1 text-2xl font-semibold leading-none">{value}</div>
      </div>
    )
  }

  const renderQuestionCard = (q: AnyAnswer, idx: number) => {
    const headerBadge = (() => {
      if (q.question_type === 'true_false_group') {
        const st = (q as TrueFalseGroupAnswer).statements || []
        const total = st.length
        const gradedCount = st.filter(s => s.is_correct !== null).length
        const correctCount = st.filter(s => s.is_correct === true).length
        const wrongCount = st.filter(s => s.is_correct === false).length
        if (!total) return null
        if (gradedCount !== total) return <StatusBadge status="pending" />
        if (wrongCount === 0 && correctCount === total) return <StatusBadge status="correct" />
        if (correctCount > 0 && wrongCount > 0) return <StatusBadge status="partial" />
        if (wrongCount === total) return <StatusBadge status="wrong" />
        return null
      }
      const v = (q as any).is_correct
      const hasScore = typeof (q as any).score_awarded === 'number'
      if (v === true) return <StatusBadge status="correct" />
      if (v === false) return <StatusBadge status="wrong" />
      return hasScore ? null : <StatusBadge status="pending" />
    })()

    const practiceScoreLine = (() => {
      if (getMode() !== 'practice') return null
      if (q.question_type === 'true_false_group') {
        const st = (q as TrueFalseGroupAnswer).statements || []
        const sumScore = st.reduce((acc, s) => acc + (Number(s.score_awarded) || 0), 0)
        const sumMax = st.reduce((acc, s) => acc + (Number(s.max_score) || 0), 0)
        return (
          <div className="mt-1 text-sm text-blue-300">
            Điểm: <span className="font-semibold">{formatScore(sumScore)} / {formatScore(sumMax)}</span>
          </div>
        )
      }
      const scoreAw = Number((q as any).score_awarded) || 0
      const maxSc = Number((q as any).max_score) || 0
      return (
        <div className="mt-1 text-sm text-blue-300">
          Điểm: <span className="font-semibold">{formatScore(scoreAw)} / {formatScore(maxSc)}</span>
        </div>
      )
    })()

    const baseHeader = (
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="text-lg font-semibold leading-snug">
            <span>Câu {idx + 1}. </span>
            <span className="font-semibold">{q.content || ''}</span>
          </div>
          {(() => {
            const raw = String((q as any).topic_unit || (q as any).topic || '').trim()
            if (!raw) return null
            return <div className="mt-1 text-sm text-gray-200/70">{getTopicLabel(q)}</div>
          })()}
          {practiceScoreLine}
        </div>
        {headerBadge ? <div className="shrink-0">{headerBadge}</div> : null}
      </div>
    )

    const imageBlock = q.image_url ? (
      <div className="space-y-2">
        <img
          src={q.image_url}
          alt={q.image_alt || 'Hình minh hoạ'}
          className="w-full max-h-64 object-contain rounded-md border"
          style={{borderColor:'var(--divider)'}}
        />
        {q.image_caption ? (
          <div className="text-sm text-gray-200/70">{q.image_caption}</div>
        ) : null}
      </div>
    ) : null

    if (q.question_type === 'single_choice' || q.question_type === 'true_false') {
      const qa = q as ChoiceAnswer
      const scoreAw = qa.score_awarded
      const maxSc = qa.max_score
      const isWrong = qa.is_correct === false
      const chosen = qa.selected_text || qa.selected_answer || '—'
      const correct = qa.correct_text || qa.correct_key || '—'
      const tip = (qa as any).tip ? String((qa as any).tip) : ''
      return (
        <Card key={q.question_id} id={`q-${idx + 1}`} className="border border-slate-700/60 bg-slate-900/30">
          <CardContent className="p-5 space-y-3">
            {baseHeader}
            {imageBlock}
            <div className="space-y-2">
              <div className="text-sm flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-gray-200/70">Em chọn:</span>
                <span className="text-red-400 font-medium">{chosen}</span>
                <span className="text-gray-200/70">Đáp án đúng:</span>
                <span className="text-green-400 font-medium">{correct}</span>
              </div>
              {getMode() === 'practice' ? null : (
                <div className="text-sm text-blue-300">
                  Điểm: <span className="font-semibold">{formatScore(scoreAw)} / {formatScore(maxSc)}</span>
                </div>
              )}
              {isWrong && qa.explanation ? (
                <div className="p-3 rounded-md border border-blue-500/30 bg-blue-500/10 text-blue-100 text-sm whitespace-pre-line">
                  <div className="font-semibold">Giải thích</div>
                  <div className="mt-1">{qa.explanation}</div>
                </div>
              ) : null}
              {tip ? (
                <div className="p-3 rounded-md border border-yellow-500/30 bg-yellow-500/10 text-yellow-100 text-sm italic whitespace-pre-line">
                  <div className="not-italic font-semibold">Mẹo học nhanh</div>
                  <div className="mt-1">{tip}</div>
                </div>
              ) : null}
              {isWrong ? (
                <div className="pt-2 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openPractice({ base_question_id: qa.question_id, strict: true }, `Luyện với câu tương tự • ${getTopicLabel(qa)}`)}
                    className={`text-xs ${practiceButtonClass}`}
                  >
                    Luyện với câu tương tự
                  </Button>
                  <ReportDialog answer={qa} onReportSuccess={handleReportSuccess} />
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      )
    }

    if (q.question_type === 'short_answer') {
      const qa = q as ShortAnswer
      const sa = saById[q.question_id]
      const scoreAw = qa.score_awarded
      const maxSc = qa.max_score
      const finalIsCorrect =
        (typeof qa.is_correct === 'boolean' ? qa.is_correct : (typeof sa?.is_correct === 'boolean' ? sa.is_correct : null))
      const isWrong = finalIsCorrect === false
      const referenceText = (sa?.correct ? String(sa.correct) : (Array.isArray(qa.reference_answers) ? qa.reference_answers.join(' | ') : ''))
      const chosen = qa.answer_text || '—'
      const comment = (sa?.comment ? String(sa.comment) : (qa.ai_feedback || ''))
      const explain = sa?.explain ? String(sa.explain) : ''
      const tip = (qa as any).tip ? String((qa as any).tip) : (sa?.tip ? String(sa.tip) : '')
      return (
        <Card key={q.question_id} id={`q-${idx + 1}`} className="border border-slate-700/60 bg-slate-900/30">
          <CardContent className="p-5 space-y-3">
            {baseHeader}
            {imageBlock}
            <div className="space-y-2">
              <div className="text-sm flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-gray-200/70">Em trả lời:</span>
                <span className="text-red-400 font-medium whitespace-pre-line">{chosen}</span>
                {referenceText ? (
                  <>
                    <span className="text-gray-200/70">Đáp án:</span>
                    <span className="text-green-400 font-medium">{referenceText}</span>
                  </>
                ) : null}
              </div>
              {getMode() === 'practice' ? null : (
                <div className="text-sm text-blue-300">
                  Điểm: <span className="font-semibold">{scoreAw == null ? '—' : formatScore(scoreAw)} / {formatScore(maxSc)}</span>
                </div>
              )}
              {comment ? (
                <div className="text-sm text-gray-200 whitespace-pre-line">{comment}</div>
              ) : qa.explanation ? (
                <div className="text-sm text-gray-200/70 whitespace-pre-line">{qa.explanation}</div>
              ) : null}
              {isWrong && explain ? (
                <div className="p-3 rounded-md border border-blue-500/30 bg-blue-500/10 text-blue-100 text-sm whitespace-pre-line">
                  <div className="font-semibold">Giải thích</div>
                  <div className="mt-1">{explain}</div>
                </div>
              ) : null}
              {tip ? (
                <div className="p-3 rounded-md border border-yellow-500/30 bg-yellow-500/10 text-yellow-100 text-sm italic whitespace-pre-line">
                  <div className="not-italic font-semibold">Mẹo học nhanh</div>
                  <div className="mt-1">{tip}</div>
                </div>
              ) : null}
              {isWrong ? (
                <div className="pt-2 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openPractice({ base_question_id: qa.question_id, strict: true }, `Luyện với câu tương tự • ${getTopicLabel(qa)}`)}
                    className={`text-xs ${practiceButtonClass}`}
                  >
                    Luyện với câu tương tự
                  </Button>
                  <ReportDialog answer={qa} onReportSuccess={handleReportSuccess} />
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      )
    }

    if (q.question_type === 'true_false_group') {
      const qa = q as TrueFalseGroupAnswer
      const st = qa.statements || []
      const sumScore = st.reduce((acc, s) => acc + (Number(s.score_awarded) || 0), 0)
      const sumMax = st.reduce((acc, s) => acc + (Number(s.max_score) || 0), 0)
      const hasWrong = st.some(s => s.is_correct === false)
      return (
        <Card key={q.question_id} id={`q-${idx + 1}`} className="border border-slate-700/60 bg-slate-900/30">
          <CardContent className="p-5 space-y-3">
            {baseHeader}
            {imageBlock}
            {getMode() === 'practice' ? null : (
              <div className="text-sm text-blue-300">
                Điểm: <span className="font-semibold">{formatScore(sumScore)} / {formatScore(sumMax)}</span>
              </div>
            )}
            {qa.explanation ? (
              <div className="text-sm text-gray-200/70 whitespace-pre-line">{qa.explanation}</div>
            ) : null}
            <div className="space-y-3">
              {st.map((s, sIdx) => {
                const label = String.fromCharCode(97 + (sIdx % 26))
                const ok = typeof s.is_correct === 'boolean' ? s.is_correct : null
                const badge = ok === true ? <StatusBadge status="correct" /> : ok === false ? <StatusBadge status="wrong" /> : null
                const stScore = s.score_awarded
                const stMax = s.max_score
                const picked = s.selected_answer === true ? 'Đúng' : s.selected_answer === false ? 'Sai' : '—'
                const correct = s.correct_answer === true ? 'Đúng' : s.correct_answer === false ? 'Sai' : '—'
                const stExplain = (s as any).explanation ? String((s as any).explanation) : ''
                const stTip = (s as any).tip ? String((s as any).tip) : ''
                return (
                  <div key={s.statement_id} className="border border-slate-700/60 bg-slate-950/20 rounded-md p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="text-base leading-relaxed text-gray-200">
                          <span className="font-semibold">{label}) </span>
                          <span>{s.text || ''}</span>
                        </div>
                      </div>
                      {badge ? <div className="shrink-0">{badge}</div> : null}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <div className="text-sm text-gray-200/70">Em chọn</div>
                        <div className="text-base text-gray-200">{picked}</div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-200/70">Đáp án đúng</div>
                        <div className="text-base text-gray-200">{correct}</div>
                      </div>
                    </div>
                    {getMode() === 'practice' ? null : (
                      <div>
                        <div className="text-sm text-blue-300">
                          Điểm: <span className="font-semibold">{formatScore(stScore)} / {formatScore(stMax)}</span>
                        </div>
                      </div>
                    )}
                    {stExplain ? (
                      <div className="p-3 rounded-md border border-blue-500/30 bg-blue-500/10 text-blue-100 text-sm whitespace-pre-line">
                        <div className="font-semibold">Giải thích</div>
                        <div className="mt-1">{stExplain}</div>
                      </div>
                    ) : null}
                    {stTip ? (
                      <div className="p-3 rounded-md border border-yellow-500/30 bg-yellow-500/10 text-yellow-100 text-sm italic whitespace-pre-line">
                        <div className="not-italic font-semibold">Mẹo học nhanh</div>
                        <div className="mt-1">{stTip}</div>
                      </div>
                    ) : null}
                    {ok === false && <div className="pt-2"><ReportDialog answer={q} onReportSuccess={handleReportSuccess} /></div>}
                  </div>
                )
              })}
            </div>
            {hasWrong ? (
              <div className="pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openPractice({ base_question_id: qa.question_id, strict: true }, `Luyện với câu tương tự • ${getTopicLabel(qa)}`)}
                  className={`text-xs ${practiceButtonClass}`}
                >
                  Luyện với câu tương tự
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )
    }

    return (
      <Card key={q.question_id || idx} className="border border-slate-700/60 bg-slate-900/30">
        <CardContent className="py-4 space-y-3">
          {baseHeader}
          {imageBlock}
        </CardContent>
      </Card>
    )
  }

  const detailQuestions = answers

  const stats = (() => {
    if (!answers.length) return { correct: 0, wrong: 0, total: 0 }
    let correct = 0
    let wrong = 0
    for (const q of answers) {
      const v = getFinalIsCorrect(q)
      if (v === true) correct += 1
      else wrong += 1
    }
    return { correct, wrong, total: answers.length }
  })()

  const topicUnitStats = useMemo(() => {
    const m: Record<string, { topic_label: string, correct: number, wrong: number, topic_unit: string, topic: string }> = {}
    for (const q of answers) {
      const label = getTopicLabel(q)
      const key = label
      const tu = String((q as any).topic_unit || '').trim()
      const t = String((q as any).topic || '').trim()
      if (!m[key]) m[key] = { topic_label: label, correct: 0, wrong: 0, topic_unit: tu, topic: t }
      const ok = getFinalIsCorrect(q)
      if (ok === true) m[key].correct += 1
      else m[key].wrong += 1
      if (!m[key].topic_unit && tu) m[key].topic_unit = tu
      if (!m[key].topic && t) m[key].topic = t
    }
    return Object.values(m).sort((a, b) => (b.wrong - a.wrong) || (b.correct - a.correct) || a.topic_label.localeCompare(b.topic_label))
  }, [answers, getFinalIsCorrect, getTopicLabel])

  const hasResult = answers.length > 0
 
  return (
    <div className="space-y-8">
      <h1 className="text-[28px] sm:text-[32px] font-semibold">Kết quả</h1>
      {practiceOpen ? (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setPracticeOpen(false)}>
          <div className="w-full max-w-4xl max-h-[90vh] overflow-auto rounded-lg border border-slate-700/60 bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-700/60 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-lg font-semibold truncate">{practiceTitle || 'Luyện tập câu tương tự'}</div>
                <div className="text-xs text-slate-200/70">Chọn đáp án để xem kết quả ngay, kèm mẹo và giải thích.</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setPracticeOpen(false)}>
                Đóng
              </Button>
            </div>
            <div className="p-4 space-y-4">
              {practiceLoading ? (
                <div className="text-sm text-slate-200/70">Đang tải câu hỏi…</div>
              ) : practiceError ? (
                <div className="p-3 rounded-md border border-rose-500/20 bg-rose-500/10 text-rose-100 text-sm">
                  {practiceError}
                </div>
              ) : null}
              {!practiceLoading && practiceItems.length ? (
                <div className="space-y-4">
                  {practiceItems.map((pq, i) => {
                    const st = practiceStateByQ[pq.question_id] || {}
                    const title = `Câu luyện ${i + 1}`
                    const imageBlock = pq.image_url ? (
                      <div className="space-y-2">
                        <img
                          src={pq.image_url}
                          alt={pq.image_alt || 'Hình minh hoạ'}
                          className="w-full max-h-64 object-contain rounded-md border"
                          style={{ borderColor: 'var(--divider)' }}
                        />
                        {pq.image_caption ? (
                          <div className="text-sm text-gray-200/70">{pq.image_caption}</div>
                        ) : null}
                      </div>
                    ) : null

                    const explainBlock = (explain: string | null | undefined) => {
                      const t = (explain || '').trim()
                      if (!t) return null
                      return (
                        <div className="p-3 rounded-md border border-blue-500/30 bg-blue-500/10 text-blue-100 text-sm whitespace-pre-line">
                          <div className="font-semibold">Giải thích</div>
                          <div className="mt-1">{t}</div>
                        </div>
                      )
                    }

                    const tipBlock = (tip: string | null | undefined) => {
                      const t = (tip || '').trim()
                      if (!t) return null
                      return (
                        <div className="p-3 rounded-md border border-yellow-500/30 bg-yellow-500/10 text-yellow-100 text-sm italic whitespace-pre-line">
                          <div className="not-italic font-semibold">Mẹo học nhanh</div>
                          <div className="mt-1">{t}</div>
                        </div>
                      )
                    }

                    if (pq.question_type === 'single_choice' || pq.question_type === 'true_false') {
                      const chosenKey = String(st.chosen_key || '')
                      const options = Array.isArray(pq.options) ? pq.options : []
                      const correctOpt = options.find(o => o.is_correct)
                      const chosenOpt = chosenKey ? options.find(o => o.key === chosenKey) : null
                      const answered = !!chosenKey
                      const ok = answered ? (chosenOpt?.is_correct === true) : null
                      return (
                        <Card key={pq.question_id} className="border border-slate-700/60 bg-slate-950/20">
                          <CardContent className="p-5 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1">
                                <div className="text-base font-semibold leading-snug">{title}</div>
                                <div className="mt-1 text-base text-slate-100 whitespace-pre-line">{pq.content || ''}</div>
                                {(pq.topic_unit || pq.topic) ? (
                                  <div className="mt-1 text-sm text-slate-200/70">{pq.topic_unit || pq.topic}</div>
                                ) : null}
                              </div>
                              {answered ? (
                                <div className="shrink-0">
                                  {ok ? <StatusBadge status="correct" /> : <StatusBadge status="wrong" />}
                                </div>
                              ) : null}
                            </div>
                            {imageBlock}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {options.map((o) => {
                                const isChosen = chosenKey === o.key
                                const show = answered
                                const cls = show && o.is_correct
                                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
                                  : show && isChosen && !o.is_correct
                                    ? 'border-rose-500/30 bg-rose-500/10 text-rose-100'
                                    : 'border-slate-700/60'
                                return (
                                  <Button
                                    key={o.key}
                                    variant="outline"
                                    size="sm"
                                    disabled={answered}
                                    className={`justify-start text-left whitespace-pre-line h-auto py-2 ${cls}`}
                                    onClick={() => patchPracticeState(pq.question_id, { chosen_key: o.key })}
                                  >
                                    <span className="font-semibold">{o.key}.</span>
                                    <span>{o.text}</span>
                                  </Button>
                                )
                              })}
                            </div>
                            {answered ? (
                              <div className="text-sm text-slate-100">
                                <span className="text-slate-200/70">Đáp án đúng:</span>{' '}
                                <span className="font-semibold text-emerald-200">{correctOpt ? `${correctOpt.key}. ${correctOpt.text}` : '—'}</span>
                              </div>
                            ) : null}
                            {answered ? (
                              <div className="space-y-2">
                                {explainBlock(pq.explanation)}
                                {tipBlock(pq.tip)}
                              </div>
                            ) : null}
                          </CardContent>
                        </Card>
                      )
                    }

                    if (pq.question_type === 'true_false_group') {
                      const chosenMap = (st.chosen_by_statement || {}) as Record<string, boolean>
                      const statements = Array.isArray(pq.statements) ? pq.statements : []
                      const anyAnswered = Object.keys(chosenMap).length > 0
                      return (
                        <Card key={pq.question_id} className="border border-slate-700/60 bg-slate-950/20">
                          <CardContent className="p-5 space-y-3">
                            <div className="space-y-1">
                              <div className="text-base font-semibold leading-snug">{title}</div>
                              <div className="text-base text-slate-100 whitespace-pre-line">{pq.content || ''}</div>
                              {(pq.topic_unit || pq.topic) ? (
                                <div className="text-sm text-slate-200/70">{pq.topic_unit || pq.topic}</div>
                              ) : null}
                            </div>
                            {imageBlock}
                            <div className="space-y-3">
                              {statements.map((s, idx2) => {
                                const label = String.fromCharCode(97 + (idx2 % 26))
                                const chosen = chosenMap[s.statement_id]
                                const answered = typeof chosen === 'boolean'
                                const ok = answered && typeof s.correct_answer === 'boolean' ? (chosen === s.correct_answer) : null
                                return (
                                  <div key={s.statement_id} className="border border-slate-700/60 bg-slate-900/30 rounded-md p-4 space-y-2">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="flex-1 text-slate-100">
                                        <span className="font-semibold">{label}) </span>
                                        <span>{s.text || ''}</span>
                                      </div>
                                      {answered && ok != null ? <div className="shrink-0">{ok ? <StatusBadge status="correct" /> : <StatusBadge status="wrong" />}</div> : null}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={answered}
                                        className="text-xs"
                                        onClick={() => patchPracticeState(pq.question_id, { chosen_by_statement: { ...chosenMap, [s.statement_id]: true } })}
                                      >
                                        Đúng
                                      </Button>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={answered}
                                        className="text-xs"
                                        onClick={() => patchPracticeState(pq.question_id, { chosen_by_statement: { ...chosenMap, [s.statement_id]: false } })}
                                      >
                                        Sai
                                      </Button>
                                      {answered ? (
                                        <div className="text-xs text-slate-200/70 flex items-center gap-2">
                                          <span>Đáp án:</span>
                                          <span className="text-emerald-200 font-semibold">
                                            {s.correct_answer === true ? 'Đúng' : s.correct_answer === false ? 'Sai' : '—'}
                                          </span>
                                        </div>
                                      ) : null}
                                    </div>
                                    {answered ? (
                                      <div className="space-y-2">
                                        {explainBlock(s.explanation)}
                                        {tipBlock(s.tip)}
                                      </div>
                                    ) : null}
                                  </div>
                                )
                              })}
                            </div>
                            {anyAnswered ? (
                              <div className="space-y-2">
                                {explainBlock(pq.explanation)}
                                {tipBlock(pq.tip)}
                              </div>
                            ) : null}
                          </CardContent>
                        </Card>
                      )
                    }

                    if (pq.question_type === 'short_answer') {
                      const inputVal = String(st.answer_text || '')
                      const checked = st.checked === true
                      const accepted = Array.isArray(pq.accepted_answers) ? pq.accepted_answers : []
                      const norm = (v: string) => v.trim().toLowerCase()
                      const ok = checked ? accepted.some(a => norm(a.text) && norm(a.text) === norm(inputVal)) : null
                      return (
                        <Card key={pq.question_id} className="border border-slate-700/60 bg-slate-950/20">
                          <CardContent className="p-5 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1">
                                <div className="text-base font-semibold leading-snug">{title}</div>
                                <div className="mt-1 text-base text-slate-100 whitespace-pre-line">{pq.content || ''}</div>
                                {(pq.topic_unit || pq.topic) ? (
                                  <div className="mt-1 text-sm text-slate-200/70">{pq.topic_unit || pq.topic}</div>
                                ) : null}
                              </div>
                              {checked && ok != null ? (
                                <div className="shrink-0">{ok ? <StatusBadge status="correct" /> : <StatusBadge status="wrong" />}</div>
                              ) : null}
                            </div>
                            {imageBlock}
                            <div className="space-y-2">
                              <Input
                                value={inputVal}
                                placeholder="Nhập đáp án của em…"
                                onChange={(e) => patchPracticeState(pq.question_id, { answer_text: e.target.value })}
                                disabled={checked}
                              />
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  disabled={checked || !inputVal.trim()}
                                  className="text-xs"
                                  onClick={() => patchPracticeState(pq.question_id, { checked: true })}
                                >
                                  Chấm
                                </Button>
                                {checked ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-xs"
                                    onClick={() => patchPracticeState(pq.question_id, { checked: false, answer_text: '' })}
                                  >
                                    Làm lại
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                            {checked ? (
                              <div className="space-y-2">
                                <div className="text-sm text-slate-100">
                                  <span className="text-slate-200/70">Đáp án tham khảo:</span>{' '}
                                  <span className="font-semibold text-emerald-200">
                                    {accepted.length ? accepted.map(a => a.text).filter(Boolean).join(' | ') : '—'}
                                  </span>
                                </div>
                                {explainBlock(pq.explanation)}
                                {tipBlock(pq.tip)}
                              </div>
                            ) : null}
                          </CardContent>
                        </Card>
                      )
                    }

                    return (
                      <Card key={pq.question_id} className="border border-slate-700/60 bg-slate-950/20">
                        <CardContent className="p-5 space-y-3">
                          <div className="text-base font-semibold">{title}</div>
                          <div className="text-sm text-slate-200/70">Chưa hỗ trợ luyện cho dạng câu hỏi này.</div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      {attempt ? (
        <div className="space-y-4">
          <Card
            className="border bg-slate-900/30 overflow-hidden"
            style={{
              borderColor: 'rgba(251,191,36,0.20)',
              backgroundImage: 'radial-gradient(700px 200px at 20% 0%, rgba(251,191,36,0.16), rgba(0,0,0,0)), radial-gradient(700px 200px at 80% 100%, rgba(59,130,246,0.10), rgba(0,0,0,0))'
            }}
          >
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center justify-between gap-2">
                <span className="truncate">{attempt.lesson_title || 'Bài làm'}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-5">
              {(() => {
                const toNumLoose = (v: any): number | null => {
                  if (v == null) return null
                  if (typeof v === 'number') return Number.isFinite(v) ? v : null
                  if (typeof v === 'object' && v && 'value' in v) return toNumLoose((v as any).value)
                  const t = String(v ?? '').trim()
                  if (!t) return null
                  const m = t.replace(',', '.').match(/-?\d+(?:\.\d+)?/)
                  if (!m) return null
                  const n = Number(m[0])
                  return Number.isFinite(n) ? n : null
                }

                const totalFromAttempt = toNumLoose((attempt as any).total_score) ?? 0
                const derivedTotal = (() => {
                  let sum = 0
                  for (const q of answers) {
                    if ((q as any).question_type === 'true_false_group') {
                      const st = Array.isArray((q as any).statements) ? (q as any).statements : []
                      for (const s of st) sum += Number(s?.max_score) || 0
                      continue
                    }
                    sum += Number((q as any).max_score) || 0
                  }
                  return sum
                })()
                const mcqMax = derivedTotal
                const total = totalFromAttempt > 0 ? totalFromAttempt : mcqMax
                const mcqScore = toNumLoose((attempt as any).raw_score) ?? 0

                const essayMaxFromAttempt = toNumLoose((attempt as any).essay_max_score) ?? 0
                const inferredEssayMax = total > mcqMax ? (total - mcqMax) : 0
                const essayMax = essayMaxFromAttempt > 0 ? essayMaxFromAttempt : inferredEssayMax

                const essayScore = toNumLoose((attempt as any).essay_score) ?? 0
                const showEssay = essayMax > 0 || essayScore > 0 || total > mcqMax

                const achieved = mcqScore + essayScore
                const scorePct = total > 0 ? Math.max(0, Math.min(100, (achieved / total) * 100)) : 0

                const correctUnits = typeof attempt.accuracy_correct_units === 'number' ? attempt.accuracy_correct_units : stats.correct
                const totalUnits = typeof attempt.accuracy_total_units === 'number' ? attempt.accuracy_total_units : (stats.total || (attempt.total_questions ?? 0))
                const acc = typeof attempt.accuracy_percent === 'number'
                  ? attempt.accuracy_percent
                  : (totalUnits ? Math.round((correctUnits / totalUnits) * 100) : 0)
                const wrongUnits = Math.max(0, (totalUnits || 0) - (correctUnits || 0))
                const mcqPct = mcqMax > 0 ? Math.max(0, Math.min(100, (mcqScore / mcqMax) * 100)) : 0
                const essayPct = essayMax > 0 ? Math.max(0, Math.min(100, (essayScore / essayMax) * 100)) : 0

                const ringColor = acc >= 80
                  ? 'rgba(34,197,94,0.85)'
                  : acc >= 60
                    ? 'rgba(251,191,36,0.85)'
                    : 'rgba(251,146,60,0.85)'

                const r = 54
                const c = 2 * Math.PI * r
                const offset = c - (scorePct / 100) * c

                return (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
                    <div className="flex items-center justify-center">
                      <div className="relative w-[140px] h-[140px]">
                        <svg width="140" height="140" viewBox="0 0 140 140" className="block">
                          <circle cx="70" cy="70" r={r} stroke="rgba(255,255,255,0.10)" strokeWidth="10" fill="none" />
                          <circle
                            cx="70"
                            cy="70"
                            r={r}
                            stroke={ringColor}
                            strokeWidth="10"
                            fill="none"
                            strokeLinecap="round"
                            strokeDasharray={c}
                            strokeDashoffset={offset}
                            transform="rotate(-90 70 70)"
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                          <div className="text-[28px] font-semibold leading-none" style={{ color: 'rgba(254,243,199,0.98)' }}>
                            {formatScore(achieved as any)}
                          </div>
                          <div className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                            / {formatScore(total as any)}
                          </div>
                          <div className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                            {Math.round(scorePct)}%
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="sm:col-span-2 space-y-4">
                      {!loading && !hasResult ? (
                        <div className="p-4 rounded-md border border-rose-500/20 bg-rose-500/10 text-rose-100">
                          <div className="font-semibold">Đang có vấn đề hệ thống</div>
                          <div className="mt-1 text-sm text-rose-100/80">
                            Không thể lấy kết quả từ AI. Vui lòng bấm nộp lại. Bài làm của em vẫn được giữ nguyên.
                          </div>
                          <div className="mt-3">
                            <Button
                              className="bg-rose-600 hover:bg-rose-700 rounded-lg"
                              onClick={() => window.location.reload()}
                            >
                              Tải lại kết quả
                            </Button>
                          </div>
                        </div>
                      ) : null}

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <SummaryStat label="Tổng câu trắc nghiệm" value={String(totalUnits || 0)} tone="neutral" />
                        <SummaryStat label="Đúng" value={String(correctUnits || 0)} tone="success" />
                        <SummaryStat label="Sai" value={String(wrongUnits)} tone="error" />
                        <SummaryStat label="Tỉ lệ đúng" value={`${acc}%`} tone="primary" />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl border p-3 bg-white/5" style={{ borderColor: 'var(--divider)' }}>
                          <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Điểm trắc nghiệm</div>
                          <div className="mt-2 h-2 w-full rounded-full overflow-hidden bg-slate-800/60 border border-slate-700/60">
                            <div className="h-full bg-emerald-500/70" style={{ width: `${mcqPct}%` }} />
                          </div>
                          <div className="mt-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                            {formatScore(mcqScore as any)} / {formatScore(mcqMax as any)}
                          </div>
                        </div>
                        <div className="rounded-xl border p-3 bg-white/5" style={{ borderColor: 'var(--divider)' }}>
                          {showEssay ? (
                            <>
                              <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Điểm essay</div>
                              <div className="mt-2 h-2 w-full rounded-full overflow-hidden bg-slate-800/60 border border-slate-700/60">
                                <div className="h-full bg-purple-500/70" style={{ width: `${essayPct}%` }} />
                              </div>
                              <div className="mt-1 text-sm font-semibold" style={{ color: 'rgba(254,243,199,0.95)' }}>
                                {formatScore(essayScore as any)} / {formatScore(essayMax as any)}
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Gợi ý</div>
                              <div className="mt-1 text-sm font-semibold" style={{ color: 'rgba(254,243,199,0.95)' }}>
                                Xem Nhận xét AI & Kế hoạch học tập
                              </div>
                              <div className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                                Ưu tiên luyện phần sai trước để tăng điểm nhanh.
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      {attempt.created_at ? (
                        <div className="text-sm flex flex-wrap items-center gap-2" style={{color:'var(--text-muted)'}}>
                          <span>Thời gian nộp bài: {formatDateTime(attempt.created_at)}</span>
                          {(() => {
                            const url = String((attempt as any).paper_image_url || '').trim()
                            if (!url) return null
                            return (
                              <>
                                <span style={{ color: 'var(--text-muted)' }}>•</span>
                                <a className="underline" href={url} target="_blank" rel="noreferrer">Xem bài đã làm</a>
                              </>
                            )
                          })()}
                        </div>
                      ) : null}
                    </div>
                  </div>
                )
              })()}
            </CardContent>
          </Card>

          <div className="space-y-4">
            {loading ? (
              <div className="text-slate-600">Uyển Sensei đang viết nhận xét…</div>
            ) : feedback ? (
              <Card className="border border-slate-700/60 bg-slate-900/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span aria-hidden="true">🤖</span>
                    <span>Nhận xét AI</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-5">
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-slate-100">Khen</div>
                    <div className="text-sm text-slate-100 whitespace-pre-line">{feedback.praise}</div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-slate-100">Điểm mạnh</div>
                    <ul className="list-disc pl-5 text-sm text-slate-100 space-y-1">
                      {feedback.strengths.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-slate-100">Kế hoạch học tập</div>
                    <ul className="list-disc pl-5 text-sm text-slate-100 space-y-1">
                      {feedback.plan.map((p, i) => <li key={i}>{p}</li>)}
                    </ul>
                    {topicUnitStats.length ? (
                      <div className="pt-4 space-y-2">
                        <div className="text-sm font-semibold text-slate-100">Thống kê theo chủ đề</div>
                        <div className="space-y-2">
                          {topicUnitStats.map((t) => (
                            <div key={t.topic_label} className="border border-slate-700/60 bg-slate-950/20 rounded-md p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                              <div className="min-w-0 space-y-2">
                                <div className="text-sm font-medium text-slate-100 truncate">{t.topic_label}</div>
                                <div className="flex items-center gap-2 text-xs">
                                  <span className="text-emerald-200 font-semibold">Đúng {t.correct}</span>
                                  <span className="text-slate-200/70">•</span>
                                  <span className="text-rose-200 font-semibold">Sai {t.wrong}</span>
                                  <span className="text-slate-200/70">
                                    ({(() => {
                                      const total = (t.correct || 0) + (t.wrong || 0)
                                      const pct = total ? Math.round(((t.correct || 0) / total) * 100) : 0
                                      return `${pct}%`
                                    })()})
                                  </span>
                                </div>
                                <div className="h-2 w-full rounded-full overflow-hidden bg-slate-800/60 border border-slate-700/60">
                                  {(() => {
                                    const total = (t.correct || 0) + (t.wrong || 0)
                                    const p = total ? ((t.correct || 0) / total) * 100 : 0
                                    const pc = Math.max(0, Math.min(100, p))
                                    return (
                                      <div className="h-full w-full flex">
                                        <div className="h-full bg-emerald-500/70" style={{ width: `${pc}%` }} />
                                        <div className="h-full bg-rose-500/70" style={{ width: `${100 - pc}%` }} />
                                      </div>
                                    )
                                  })()}
                                </div>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                className={`text-xs self-start sm:self-auto ${practiceButtonClass}`}
                                onClick={() => openPractice(t.topic_unit ? { topic_unit: t.topic_unit } : { topic: t.topic || t.topic_label }, `Luyện tập câu tương tự • ${t.topic_label}`)}
                              >
                                Luyện tập câu tương tự
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="text-slate-600">Chưa có nhận xét.</div>
            )}
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Chi tiết từng câu</h2>
            {detailQuestions.length ? (
              <div className="flex flex-wrap gap-2">
                {detailQuestions.map((q, i) => {
                  const status = (() => {
                    if (q.question_type === 'true_false_group') {
                      const st = (q as TrueFalseGroupAnswer).statements || []
                      if (!st.length) return 'pending'
                      const wrongCount = st.filter(s => s.is_correct === false).length
                      const correctCount = st.filter(s => s.is_correct === true).length
                      if (wrongCount === 0 && correctCount === st.length) return 'correct'
                      if (wrongCount === st.length) return 'wrong'
                      if (wrongCount > 0 && correctCount > 0) return 'partial'
                      return 'pending'
                    }
                    if ((q as any).is_correct === true) return 'correct'
                    if ((q as any).is_correct === false) return 'wrong'
                    return 'pending'
                  })() as 'correct' | 'wrong' | 'partial' | 'pending'
                  const cls = status === 'correct'
                    ? 'text-emerald-200 bg-emerald-500/10 border-emerald-500/20'
                    : status === 'wrong'
                      ? 'text-rose-200 bg-rose-500/10 border-rose-500/20'
                      : status === 'partial'
                        ? 'text-amber-200 bg-amber-500/10 border-amber-500/20'
                        : 'text-slate-200 bg-slate-800/40 border-slate-600'
                  return (
                    <a
                      key={q.question_id || i}
                      href={`#q-${i + 1}`}
                      className={`w-10 h-10 rounded-md border flex items-center justify-center text-sm font-semibold ${cls}`}
                    >
                      {i + 1}
                    </a>
                  )
                })}
              </div>
            ) : null}
            {detailQuestions.length ? (
              <div className="space-y-4">
                {detailQuestions.map((q, idx) => renderQuestionCard(q, idx))}
              </div>
            ) : (
              <div className="text-sm" style={{color:'var(--text-muted)'}}>Chưa có dữ liệu câu trả lời.</div>
            )}
          </div>
        </div>
      ) : null}
      <div className="pt-2 flex justify-center">
        <Link href="/"><Button variant="outline">Trở về trang chủ</Button></Link>
      </div>
      <ProfileCompletionPrompt enabled={!!attempt && !loading} />
    </div>
  )
}

// ChatBox tạm dừng trong giai đoạn nâng cấp
