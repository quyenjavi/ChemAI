'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

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

export default function ResultPage() {
  const params = useParams()
  const attemptId = (params as any)?.attemptId as string | undefined
  const [attempt, setAttempt] = useState<AttemptInfo | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [shortAnswerResults, setShortAnswerResults] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [answers, setAnswers] = useState<AnyAnswer[]>([])

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
      ? 'text-green-400 bg-green-900/20 border-green-500'
      : status === 'wrong'
        ? 'text-red-400 bg-red-900/20 border-red-500'
        : status === 'partial'
          ? 'text-yellow-300 bg-yellow-900/20 border-yellow-400'
          : 'text-gray-200 bg-slate-800/40 border-slate-600'
    const label = status === 'correct' ? '✅ Đúng' : status === 'wrong' ? '❌ Sai' : status === 'partial' ? '⚠️ Một phần đúng' : 'Chưa chấm'
    return <span className={`text-xs px-2 py-1 rounded-md border ${cls}`}>{label}</span>
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

    const baseHeader = (
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="text-lg font-semibold leading-snug">
            <span>Câu {idx + 1}. </span>
            <span className="font-semibold">{q.content || ''}</span>
          </div>
          {q.topic ? (
            <div className="mt-1 text-sm text-gray-200/70">{q.topic}</div>
          ) : null}
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
        <Card key={q.question_id} id={`q-${idx + 1}`} className="border" style={{borderColor:'var(--divider)'}}>
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
              <div className="text-sm text-blue-300">
                Điểm: <span className="font-semibold">{formatScore(scoreAw)} / {formatScore(maxSc)}</span>
              </div>
              {isWrong && qa.explanation ? (
                <div className="p-3 rounded-md border bg-blue-900/20 border-blue-400 text-blue-300 text-sm whitespace-pre-line">
                  <div className="font-semibold">Giải thích</div>
                  <div className="mt-1">{qa.explanation}</div>
                </div>
              ) : null}
              {tip ? (
                <div className="p-3 rounded-md border bg-yellow-900/20 border-yellow-400 text-yellow-300 text-sm italic whitespace-pre-line">
                  <div className="not-italic font-semibold">Mẹo học nhanh</div>
                  <div className="mt-1">{tip}</div>
                </div>
              ) : null}
              {isWrong && <div className="pt-2"><ReportDialog answer={qa} onReportSuccess={handleReportSuccess} /></div>}
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
        <Card key={q.question_id} id={`q-${idx + 1}`} className="border" style={{borderColor:'var(--divider)'}}>
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
              <div className="text-sm text-blue-300">
                Điểm: <span className="font-semibold">{scoreAw == null ? '—' : formatScore(scoreAw)} / {formatScore(maxSc)}</span>
              </div>
              {comment ? (
                <div className="text-sm text-gray-200 whitespace-pre-line">{comment}</div>
              ) : qa.explanation ? (
                <div className="text-sm text-gray-200/70 whitespace-pre-line">{qa.explanation}</div>
              ) : null}
              {isWrong && explain ? (
                <div className="p-3 rounded-md border bg-blue-900/20 border-blue-400 text-blue-300 text-sm whitespace-pre-line">
                  <div className="font-semibold">Giải thích</div>
                  <div className="mt-1">{explain}</div>
                </div>
              ) : null}
              {tip ? (
                <div className="p-3 rounded-md border bg-yellow-900/20 border-yellow-400 text-yellow-300 text-sm italic whitespace-pre-line">
                  <div className="not-italic font-semibold">Mẹo học nhanh</div>
                  <div className="mt-1">{tip}</div>
                </div>
              ) : null}
              {isWrong && <div className="pt-2"><ReportDialog answer={qa} onReportSuccess={handleReportSuccess} /></div>}
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
      return (
        <Card key={q.question_id} id={`q-${idx + 1}`} className="border" style={{borderColor:'var(--divider)'}}>
          <CardContent className="p-5 space-y-3">
            {baseHeader}
            {imageBlock}
            <div className="text-sm text-blue-300">
              Điểm: <span className="font-semibold">{formatScore(sumScore)} / {formatScore(sumMax)}</span>
            </div>
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
                  <div key={s.statement_id} className="border rounded-md p-4 space-y-2" style={{borderColor:'var(--divider)'}}>
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
                    <div>
                      <div className="text-sm text-blue-300">
                        Điểm: <span className="font-semibold">{formatScore(stScore)} / {formatScore(stMax)}</span>
                      </div>
                    </div>
                    {stExplain ? (
                      <div className="p-3 rounded-md border bg-blue-900/20 border-blue-400 text-blue-300 text-sm whitespace-pre-line">
                        <div className="font-semibold">Giải thích</div>
                        <div className="mt-1">{stExplain}</div>
                      </div>
                    ) : null}
                    {stTip ? (
                      <div className="p-3 rounded-md border bg-yellow-900/20 border-yellow-400 text-yellow-300 text-sm italic whitespace-pre-line">
                        <div className="not-italic font-semibold">Mẹo học nhanh</div>
                        <div className="mt-1">{stTip}</div>
                      </div>
                    ) : null}
                    {ok === false && <div className="pt-2"><ReportDialog answer={q} onReportSuccess={handleReportSuccess} /></div>}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )
    }

    return (
      <Card key={q.question_id || idx} className="border" style={{borderColor:'var(--divider)'}}>
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
      if (q.question_type === 'true_false_group') {
        const st = (q as TrueFalseGroupAnswer).statements || []
        if (!st.length) continue
        const wrongCount = st.filter(s => s.is_correct === false).length
        if (wrongCount === 0) correct += 1
        else wrong += 1
        continue
      }
      if ((q as any).is_correct === true) correct += 1
      else if ((q as any).is_correct === false) wrong += 1
    }
    return { correct, wrong, total: answers.length }
  })()

  const hasResult = answers.length > 0
 
  return (
    <div className="space-y-8">
      <h1 className="text-[28px] sm:text-[32px] font-semibold">Kết quả</h1>
      {attempt ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center justify-between gap-2">
                <span>{attempt.lesson_title || 'Bài làm'}</span>
                <span className="text-sm font-normal" style={{color:'var(--text-muted)'}}>
                  Loại bài: {(getMode() === 'exam') ? 'Exam' : 'Practice'}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-5">
              {getMode() === 'exam' ? (
                <div className="text-2xl font-semibold text-blue-300">
                  Điểm: {formatScore((attempt.raw_score ?? 0) as any)} / 10
                </div>
              ) : (
                (() => {
                  const correctUnits = typeof attempt.accuracy_correct_units === 'number' ? attempt.accuracy_correct_units : 0
                  const totalUnits = typeof attempt.accuracy_total_units === 'number' ? attempt.accuracy_total_units : 0
                  const acc = typeof attempt.accuracy_percent === 'number'
                    ? attempt.accuracy_percent
                    : (totalUnits ? Math.round((correctUnits / totalUnits) * 100) : 0)
                  return (
                    <>
                      <div className="text-2xl font-semibold text-blue-300">Đúng {correctUnits}/{totalUnits} câu</div>
                      <div className="text-sm text-blue-300/90">Accuracy: {acc}%</div>
                    </>
                  )
                })()
              )}
              {!loading && !hasResult ? (
                <div className="p-4 rounded-md border bg-red-900/20 border-red-500 text-red-400">
                  <div className="font-semibold">Đang có vấn đề hệ thống</div>
                  <div className="mt-1 text-sm text-red-400/90">
                    Không thể lấy kết quả từ AI. Vui lòng bấm nộp lại. Bài làm của em vẫn được giữ nguyên.
                  </div>
                  <div className="mt-3">
                    <Button
                      className="bg-red-600 hover:bg-red-700 rounded-lg"
                      onClick={() => window.location.reload()}
                    >
                      Tải lại kết quả
                    </Button>
                  </div>
                </div>
              ) : null}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-md border p-3" style={{borderColor:'var(--divider)'}}>
                  <div className="text-xs text-gray-200/70">Đúng</div>
                  <div className="text-lg font-semibold text-green-400">{stats.correct}</div>
                </div>
                <div className="rounded-md border p-3" style={{borderColor:'var(--divider)'}}>
                  <div className="text-xs text-gray-200/70">Sai</div>
                  <div className="text-lg font-semibold text-red-400">{stats.wrong}</div>
                </div>
                <div className="rounded-md border p-3" style={{borderColor:'var(--divider)'}}>
                  <div className="text-xs text-gray-200/70">Tổng câu</div>
                  <div className="text-lg font-semibold text-gray-200">{stats.total || (attempt.total_questions ?? 0)}</div>
                </div>
                <div className="rounded-md border p-3" style={{borderColor:'var(--divider)'}}>
                  <div className="text-xs text-gray-200/70">Trạng thái</div>
                  <div className="text-lg font-semibold text-gray-200">{attempt.status || '—'}</div>
                </div>
              </div>
              {attempt.created_at ? (
                <div className="text-sm" style={{color:'var(--text-muted)'}}>
                  Thời gian nộp bài: {formatDateTime(attempt.created_at)}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Nhận xét từ AI</h2>
            {loading ? (
              <div className="text-slate-600">Uyển Sensei đang viết nhận xét…</div>
            ) : feedback ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="md:col-span-2">
                  <CardHeader><CardTitle>Nhận xét chung</CardTitle></CardHeader>
                  <CardContent><p className="whitespace-pre-line" style={{color:'var(--text)'}}>{feedback.praise}</p></CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Điểm mạnh</CardTitle></CardHeader>
                  <CardContent>
                    <ul className="list-disc pl-5" style={{color:'var(--text)'}}>
                      {feedback.strengths.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Kế hoạch ôn tập</CardTitle></CardHeader>
                  <CardContent>
                    <ul className="list-disc pl-5" style={{color:'var(--text)'}}>
                      {feedback.plan.map((p, i) => <li key={i}>{p}</li>)}
                    </ul>
                  </CardContent>
                </Card>
              </div>
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
                    ? 'text-green-400 bg-green-900/20 border-green-500'
                    : status === 'wrong'
                      ? 'text-red-400 bg-red-900/20 border-red-500'
                      : status === 'partial'
                        ? 'text-yellow-300 bg-yellow-900/20 border-yellow-400'
                        : 'text-gray-200 bg-slate-800/40 border-slate-600'
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
    </div>
  )
}

// ChatBox tạm dừng trong giai đoạn nâng cấp
