'use client'
import { useCallback, useEffect, useMemo, useState, useRef, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/components/AuthProvider'

type Q = {
  id: string,
  content: string,
  question_type: 'single_choice' | 'true_false' | 'short_answer' | 'true_false_group',
  order_index: number,
  topic?: string,
  lesson_id?: string,
  options: Array<{ key: string, text: string }>,
  statements?: Array<{ id: string, text: string, sort_order: number }>,
  image_url?: string,
  image_alt?: string,
  image_caption?: string
}

export default function QuizClient({ lessonId, n }: { lessonId: string, n?: string }) {
  const EXAM_DURATION_SEC = 45 * 60
  const desiredCount = (() => {
    const parsedN = Number(n)
    return (Number.isFinite(parsedN) && parsedN > 0) ? Math.min(50, parsedN) : null
  })()
  const [questions, setQuestions] = useState<Q[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [lessonType, setLessonType] = useState<'practice' | 'exam'>('practice')
  const [submitting, setSubmitting] = useState(false)
  const [quoteIndex, setQuoteIndex] = useState(0)
  const [interestSelected, setInterestSelected] = useState<Record<string, boolean>>({})
  const [interestSaving, setInterestSaving] = useState<Record<string, boolean>>({})
  const [interestFeedback, setInterestFeedback] = useState('')
  const [interestOtherText, setInterestOtherText] = useState('')
  const [initError, setInitError] = useState('')
  const [examTimeLeftSec, setExamTimeLeftSec] = useState<number | null>(null)
  const router = useRouter()
  const { user, loading: authLoading, ensureAuthCookie } = useAuth()

  const quotes = useMemo(() => ([
    'Hoá học dạy ta: thay đổi cấu trúc nhỏ có thể đổi cả tính chất.',
    'Bền bỉ như liên kết cộng hoá trị—càng luyện càng chắc.',
    'Phản ứng chậm không phải thất bại—chỉ là cần thời gian và điều kiện phù hợp.',
    'Mỗi lần sai là một phép thử—dữ liệu để tiến bộ.',
    'Kiến thức hoá học tích luỹ như mol—đủ lượng là bứt phá.',
    'Giữ bình tĩnh: cân bằng phương trình trước, rồi cân bằng cảm xúc.',
    'Hôm nay học một chút—ngày mai vững một mảng.',
    'Chậm mà chắc như kết tủa—đến lúc sẽ “ra chất”.',
    'Tư duy khoa học: quan sát, giả thuyết, kiểm chứng, cải thiện.',
    'Không có điểm số nào định nghĩa em—chỉ có quá trình em tiến bộ.'
  ]), [])

  useEffect(() => {
    if (!submitting) return
    setQuoteIndex(0)
    const t = setInterval(() => {
      setQuoteIndex(i => (i + 1) % quotes.length)
    }, 3000)
    return () => clearInterval(t)
  }, [submitting, quotes.length])

  const toggleInterest = useCallback(async (subject: 'english' | 'math' | 'physics') => {
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
  }, [])

  const saveOtherInterest = useCallback(async () => {
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
  }, [interestOtherText])

  const initStartedRef = useRef(false)
  const attemptIdRef = useRef<string | null>(null)
  const fetchCountRef = useRef(0)
  const examEndAtRef = useRef<number | null>(null)
  const autoSubmittedRef = useRef(false)
  const questionsRef = useRef<Q[]>([])
  const answersRef = useRef<Record<string, string>>({})

  useEffect(() => {
    initStartedRef.current = false
    attemptIdRef.current = null
    fetchCountRef.current = 0
    examEndAtRef.current = null
    autoSubmittedRef.current = false
    setQuestions([])
    setAnswers({})
    setAttemptId(null)
    setInitError('')
    setExamTimeLeftSec(null)
  }, [lessonId])

  useEffect(() => {
    questionsRef.current = questions
  }, [questions])

  useEffect(() => {
    answersRef.current = answers
  }, [answers])

  useEffect(() => {
    if (!lessonId || attemptIdRef.current || initStartedRef.current) return
    if (authLoading) return
    if (!user?.id) {
      router.push('/login')
      return
    }
    
    initStartedRef.current = true
    let isMounted = true
    
    const initQuiz = async () => {
      setInitError('')

      try {
        await ensureAuthCookie()

        // 1. Create attempt first
        let createRes = await fetch('/api/attempts/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lessonId }),
          credentials: 'include',
        })
        
        if (createRes.status === 401) {
          await ensureAuthCookie()
          createRes = await fetch('/api/attempts/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lessonId }),
            credentials: 'include',
          })
        }

        const createJson = await createRes.json().catch(() => ({}))

        if (!createRes.ok) {
          throw new Error(createJson.error || 'Không thể khởi tạo bài làm. Vui lòng đăng nhập lại.')
        }

        const newAttemptId = createJson.attemptId
        if (!newAttemptId) throw new Error('Không nhận được attemptId từ server')
        
        if (!isMounted) return
        attemptIdRef.current = newAttemptId
        setAttemptId(newAttemptId)

        // 2. Fetch questions with attemptId
        const qParams = new URLSearchParams()
        qParams.set('attemptId', newAttemptId)
        if (desiredCount) qParams.set('n', String(desiredCount))
        
        const qUrl = `/api/lessons/${lessonId}/questions?${qParams.toString()}`
        
        fetchCountRef.current += 1
        let qRes = await fetch(qUrl, { credentials: 'include' })
        if (qRes.status === 401) {
          await ensureAuthCookie()
          qRes = await fetch(qUrl, { credentials: 'include' })
        }
        const qJson = await qRes.json().catch(async () => ({ error: await qRes.text().catch(()=> 'Lỗi tải câu hỏi') }))
        
        if (!qRes.ok) {
          throw new Error(qJson.error || 'Lỗi tải câu hỏi')
        }

        if (!isMounted) return
        const list: Q[] = Array.isArray(qJson) ? qJson : (qJson?.questions || [])
        setQuestions(list)
        setLessonType(qJson?.lesson?.lesson_type === 'exam' ? 'exam' : 'practice')

      } catch (err: any) {
        console.error('Quiz initialization error:', err)
        if (isMounted) setInitError(err?.message || 'Lỗi khởi tạo bài')
      }
    }

    initQuiz()

    return () => {
      isMounted = false
    }
  }, [authLoading, ensureAuthCookie, lessonId, desiredCount, router, user?.id])

  const canSubmit = useMemo(() => {
    return !submitting && attemptId && questions.length > 0
  }, [submitting, attemptId, questions.length])

  const answeredMap = useMemo(() => {
    const m: Record<string, boolean> = {}
    for (const q of questions) {
      if (q.question_type === 'short_answer') {
        m[q.id] = !!(answers[q.id] || '').trim()
        continue
      }
      if (q.question_type === 'true_false_group') {
        const st = q.statements || []
        let any = false
        for (const s of st) {
          const v = answers[`${q.id}::${s.id}`]
          if (v === 'true' || v === 'false') any = true
        }
        m[q.id] = any
        continue
      }
      m[q.id] = !!(answers[q.id] || '').trim()
    }
    return m
  }, [answers, questions])

  const answeredCount = useMemo(() => {
    return Object.values(answeredMap).filter(Boolean).length
  }, [answeredMap])

  const progressPct = useMemo(() => {
    return questions.length ? Math.round((answeredCount / questions.length) * 100) : 0
  }, [answeredCount, questions.length])

  const onSubmit = useCallback(async () => {
    const id = attemptIdRef.current || attemptId
    const qs = questionsRef.current || []
    const ans = answersRef.current || {}
    if (!id) return
    if (!qs.length) return

    if (submitting) return
    setSubmitting(true)

    try {
      await ensureAuthCookie()
      const answered: Array<any> = qs.map((q) => {
        if (q.question_type === 'short_answer') {
          return { questionId: q.id, answer_text: (ans[q.id] || '').trim() }
        }
        if (q.question_type === 'true_false_group') {
          const statement_answers: Record<string, boolean | null> = {}
          for (const s of (q.statements || [])) {
            const v = ans[`${q.id}::${s.id}`]
            statement_answers[s.id] = v === 'true' ? true : v === 'false' ? false : null
          }
          return { questionId: q.id, statement_answers }
        }
        return { questionId: q.id, selected_answer: (ans[q.id] || '') }
      })
      const payload = {
        attemptId: id,
        answers: answered
      }
      const res = await fetch('/api/attempts/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include'
      })
      if (!res.ok) {
        alert('Nộp bài thất bại')
        return
      }
      const j = await res.json()
      if (lessonType === 'exam') {
        try {
          localStorage.removeItem(`exam_end_at:${id}`)
        } catch {}
      }
      router.push(`/attempt/${j.attemptId}/result`)
    } finally {
      setSubmitting(false)
    }
  }, [attemptId, ensureAuthCookie, lessonType, router, submitting])

  const formatTimeLeft = useCallback((sec: number) => {
    const s = Math.max(0, Math.floor(sec))
    const mm = Math.floor(s / 60)
    const ss = s % 60
    return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
  }, [])

  useEffect(() => {
    if (lessonType !== 'exam' || !attemptId) {
      examEndAtRef.current = null
      autoSubmittedRef.current = false
      setExamTimeLeftSec(null)
      return
    }

    const key = `exam_end_at:${attemptId}`
    const now = Date.now()
    const stored = Number(localStorage.getItem(key) || '')
    const endAt = Number.isFinite(stored) && stored > 0 ? stored : (now + EXAM_DURATION_SEC * 1000)
    if (!Number.isFinite(stored) || stored <= 0) {
      localStorage.setItem(key, String(endAt))
    }
    examEndAtRef.current = endAt

    const tick = () => {
      const end = examEndAtRef.current || endAt
      const left = Math.max(0, Math.ceil((end - Date.now()) / 1000))
      setExamTimeLeftSec(left)

      if (left <= 0 && !autoSubmittedRef.current && !submitting && attemptId && questions.length > 0) {
        autoSubmittedRef.current = true
        localStorage.removeItem(key)
        onSubmit()
      }
    }

    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [EXAM_DURATION_SEC, attemptId, lessonType, onSubmit, questions.length, submitting])

  return (
    <div className="space-y-6">
      {submitting ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <div className="w-full max-w-lg border rounded-2xl p-6 bg-[var(--bg)] space-y-5" style={{borderColor:'var(--divider)'}}>
            <div className="space-y-2">
              <div className="text-xl font-semibold">Giáo viên đang chấm bài…</div>
              <div className="text-sm" style={{color:'var(--text-secondary)'}}>
                Vui lòng đợi một chút, ChemAI đang tổng hợp kết quả và nhận xét.
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
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setInterestOtherText(e.target.value)}
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
                <div className="text-sm" style={{ color: 'var(--success)' }}>{interestFeedback}</div>
              ) : null}
            </div>

            <div className="p-4 rounded-xl border bg-white/5 space-y-2" style={{ borderColor: 'var(--divider)' }}>
              <div className="text-sm font-semibold">Đợi xíu nhé, bài của bạn đang load…</div>
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Các phân tích lỗi sai, mẹo ôn tập và cập nhật quan trọng sẽ được đăng trên Facebook ChemAI.
              </div>
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Follow ngay để không bỏ lỡ nhé!
              </div>
              <a
                className="inline-flex items-center justify-center text-sm px-4 py-2.5 rounded-md border border-slate-200/25 bg-white/10 hover:bg-white/20 transition w-full"
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
              <div className="text-sm italic whitespace-pre-line" style={{color:'var(--text-secondary)'}}>
                {quotes[quoteIndex] || ''}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <div className="space-y-1">
        <h1 className="text-[22px] sm:text-[24px] font-semibold">Bài quiz</h1>
        <div className="text-sm text-gray-200/70">
          {(lessonType === 'exam') ? 'Thi thử' : 'Luyện tập'} · Số câu: {questions.length}
          {(lessonType === 'exam') && (examTimeLeftSec != null) ? (
            <>
              {' '}· Thời gian còn lại:{' '}
              <span className={examTimeLeftSec <= 5 * 60 ? 'text-rose-300 font-semibold' : 'text-emerald-300 font-semibold'}>
                {formatTimeLeft(examTimeLeftSec)}
              </span>
            </>
          ) : null}
        </div>
      </div>
      {initError ? <div className="text-sm text-red-600">{initError}</div> : null}
      {questions.length ? (
        <div className="flex flex-wrap gap-2">
          {questions.map((q, idx) => {
            const answered = answeredMap[q.id]
            const cls = answered
              ? 'text-blue-300 bg-blue-900/20 border-blue-400'
              : 'text-gray-200 bg-slate-800/40 border-slate-600'
            return (
              <a
                key={q.id}
                href={`#q-${idx + 1}`}
                className={`w-10 h-10 rounded-md border flex items-center justify-center text-sm font-semibold ${cls}`}
              >
                {idx + 1}
              </a>
            )
          })}
        </div>
      ) : null}
      <div className="space-y-6">
        {questions.map((q, idx) => (
          <Card key={q.id} id={`q-${idx + 1}`} className="border" style={{borderColor:'var(--divider)'}}>
            <CardHeader>
              <CardTitle className="text-lg font-semibold leading-snug">
                <span>Câu {idx + 1}. </span>
                <span className="font-semibold">{q.content}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              {q.image_url ? (
                <div className="space-y-2">
                  <img
                    src={q.image_url}
                    alt={q.image_alt || 'Hình minh họa'}
                    className="w-full max-h-64 object-contain rounded-md border"
                    style={{ borderColor: 'var(--divider)' }}
                  />
                  {q.image_caption ? (
                    <div className="text-sm text-gray-200/70">{q.image_caption}</div>
                  ) : null}
                </div>
              ) : null}
              {q.question_type === 'short_answer' ? (
                <textarea
                  className="w-full min-h-32 rounded-md border border-[var(--divider)] bg-[var(--bg)] text-[var(--text)] p-3 text-base leading-relaxed"
                  rows={4}
                  value={answers[q.id] || ''}
                  onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
                  placeholder="Nhập câu trả lời của bạn..."
                />
              ) : q.question_type === 'true_false_group' ? (
                <div className="space-y-3">
                  {(q.statements || []).map((s, sIdx) => {
                    const label = String.fromCharCode(97 + sIdx)
                    const key = `${q.id}::${s.id}`
                    const val = answers[key] || ''
                    const btnCls = (active: boolean) => active
                      ? 'border-blue-400 bg-blue-900/20 text-blue-300'
                      : 'border-[var(--divider)] bg-[var(--bg)] text-[var(--text)]'
                    return (
                      <div key={s.id} className="border rounded-md p-4 space-y-3" style={{borderColor:'var(--divider)'}}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="text-base leading-relaxed flex-1">
                            <span className="font-semibold">{label}) </span>
                            <span>{s.text}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                          <label className={`h-9 rounded-md border px-3 flex items-center justify-center cursor-pointer ${btnCls(val === 'true')}`}>
                            <input
                              type="radio"
                              name={key}
                              className="hidden"
                              checked={val === 'true'}
                              onChange={() => setAnswers(a => ({ ...a, [key]: 'true' }))}
                            />
                            <span className="text-sm font-medium">Đúng</span>
                          </label>
                          <label className={`h-9 rounded-md border px-3 flex items-center justify-center cursor-pointer ${btnCls(val === 'false')}`}>
                            <input
                              type="radio"
                              name={key}
                              className="hidden"
                              checked={val === 'false'}
                              onChange={() => setAnswers(a => ({ ...a, [key]: 'false' }))}
                            />
                            <span className="text-sm font-medium">Sai</span>
                          </label>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="space-y-3">
                  {q.options.map((opt) => {
                    const active = (answers[q.id] || '') === opt.key
                    const cls = active
                      ? 'border-blue-400 bg-blue-900/20 text-blue-300'
                      : 'border-[var(--divider)] bg-[var(--bg)] text-[var(--text)]'
                    return (
                      <label key={opt.key} className={`min-h-12 rounded-md border px-4 py-3 flex items-start gap-3 cursor-pointer ${cls}`}>
                        <input
                          type="radio"
                          className="mt-1"
                          name={`q-${q.id}`}
                          checked={active}
                          onChange={() => setAnswers(a => ({ ...a, [q.id]: opt.key }))}
                        />
                        <div className="text-base leading-relaxed">
                          <span className="font-semibold">{opt.key}. </span>
                          <span>{opt.text}</span>
                        </div>
                      </label>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm text-gray-200/70">
          <span>Tiến độ</span>
          <span>Đã làm {answeredCount}/{questions.length} câu</span>
        </div>
        <div className="h-2 w-full rounded bg-slate-700/40 overflow-hidden">
          <div className="h-full bg-blue-500/70" style={{ width: `${progressPct}%` }} />
        </div>
        <Button
          disabled={!canSubmit}
          onClick={onSubmit}
          className="disabled:opacity-50 bg-blue-600 hover:bg-blue-700 rounded-lg min-h-12 px-6 text-base w-full sm:w-auto"
        >
          {submitting ? 'Đang nộp...' : 'Nộp bài'}
        </Button>
      </div>
    </div>
  )
}
