'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/components/AuthProvider'

type TopicStat = {
  topic_unit: string | null
  correct: number
  wrong: number
  total: number
  correct_percent: number
}

type AttemptItem = {
  id: string
  lesson_id: string | null
  lesson_title: string
  created_at: string | null
  total: number
  correct: number
  percent: number
  has_report: boolean
  reviewed: boolean
  has_adjustment: boolean
}

type PracticeOption = { key: string, text: string, is_correct: boolean }
type PracticeStatement = { statement_id: string, key: string | null, text: string, correct_answer: boolean | null, explanation: string | null, tip: string | null, sort_order: number }
type PracticeShortAnswer = { text: string, explanation: string | null, tip: string | null }
type PracticeQuestion = {
  question_id: string
  content: string
  question_type: string
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

function normalizeText(s: any) {
  return String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

export default function StudyHistoryPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [topicStats, setTopicStats] = useState<TopicStat[]>([])
  const [attempts, setAttempts] = useState<AttemptItem[]>([])

  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [selectedAttemptMeta, setSelectedAttemptMeta] = useState<any | null>(null)
  const [selectedAttemptFeedback, setSelectedAttemptFeedback] = useState<any | null>(null)
  const [attemptDetail, setAttemptDetail] = useState<any[] | null>(null)
  const [detailError, setDetailError] = useState('')

  const [reportModal, setReportModal] = useState<null | { qid: string, aid: string, answer_id: string | null }>(null)
  const [reportReason, setReportReason] = useState('')
  const [reportDetailText, setReportDetailText] = useState('')
  const [reporting, setReporting] = useState(false)

  const [practiceOpen, setPracticeOpen] = useState(false)
  const [practiceTitle, setPracticeTitle] = useState('')
  const [practiceLoading, setPracticeLoading] = useState(false)
  const [practiceError, setPracticeError] = useState('')
  const [practiceItems, setPracticeItems] = useState<PracticeQuestion[]>([])
  const [practiceStateByQ, setPracticeStateByQ] = useState<Record<string, any>>({})

  const loadSummary = useCallback(async () => {
    if (authLoading) return
    if (!user?.id) { router.push('/login'); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/student/study-history', { credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Không thể tải lịch sử học tập')
      setTopicStats(Array.isArray(json.topic_stats) ? json.topic_stats : [])
      setAttempts(Array.isArray(json.attempts) ? json.attempts : [])
    } catch (e: any) {
      setError(e.message || 'Có lỗi xảy ra')
    } finally {
      setLoading(false)
    }
  }, [authLoading, router, user?.id])

  useEffect(() => {
    loadSummary()
  }, [loadSummary])

  const openAttemptDetail = useCallback(async (attemptId: string) => {
    setSelectedAttemptId(attemptId)
    setDetailLoading(true)
    setDetailError('')
    setSelectedAttemptMeta(null)
    setSelectedAttemptFeedback(null)
    setAttemptDetail(null)
    try {
      const [ansRes, repRes] = await Promise.all([
        fetch(`/api/attempts/${attemptId}/answers`, { credentials: 'include' }),
        fetch(`/api/attempts/${attemptId}/report`, { credentials: 'include' })
      ])
      const ansJson = await ansRes.json().catch(() => ({}))
      const repJson = await repRes.json().catch(() => ({}))
      if (!ansRes.ok) throw new Error(ansJson.error || 'Không thể tải chi tiết bài làm')
      if (!repRes.ok) throw new Error(repJson.error || 'Không thể tải nhận xét AI')
      setSelectedAttemptMeta(ansJson.attempt || null)
      setAttemptDetail(Array.isArray(ansJson.answers) ? ansJson.answers : [])
      setSelectedAttemptFeedback(repJson.report || repJson || null)
    } catch (e: any) {
      setDetailError(e.message || 'Có lỗi xảy ra')
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const closeAttemptDetail = useCallback(() => {
    setSelectedAttemptId(null)
    setDetailError('')
    setSelectedAttemptMeta(null)
    setSelectedAttemptFeedback(null)
    setAttemptDetail(null)
  }, [])

  const handleReport = useCallback(async () => {
    if (!reportModal) return
    if (!reportReason) return
    setReporting(true)
    try {
      const res = await fetch(`/api/student/attempts/${reportModal.aid}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          question_id: reportModal.qid,
          attempt_answer_id: reportModal.answer_id,
          report_reason: reportReason,
          report_detail: reportDetailText
        })
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Gửi báo cáo thất bại')
      setReportModal(null)
      setReportReason('')
      setReportDetailText('')
      await openAttemptDetail(reportModal.aid)
      await loadSummary()
    } catch (e: any) {
      alert(e.message || 'Gửi báo cáo thất bại')
    } finally {
      setReporting(false)
    }
  }, [loadSummary, openAttemptDetail, reportDetailText, reportModal, reportReason])

  const openPractice = useCallback(async (payload: { topic_unit?: string | null, topic?: string | null }, title: string) => {
    setPracticeOpen(true)
    setPracticeTitle(title)
    setPracticeItems([])
    setPracticeError('')
    setPracticeStateByQ({})
    setPracticeLoading(true)
    try {
      const res = await fetch('/api/questions/similar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 8, ...payload }),
        credentials: 'include'
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Không thể lấy câu luyện tập')
      const items = Array.isArray(json?.items) ? (json.items as PracticeQuestion[]) : []
      setPracticeItems(items)
      if (!items.length) setPracticeError('Không tìm thấy câu hỏi phù hợp để luyện tập.')
    } catch (e: any) {
      setPracticeError(e.message || 'Có lỗi xảy ra')
    } finally {
      setPracticeLoading(false)
    }
  }, [])

  const patchPracticeState = useCallback((questionId: string, patch: Record<string, any>) => {
    setPracticeStateByQ(prev => {
      const cur = prev[questionId] || {}
      return { ...prev, [questionId]: { ...cur, ...patch } }
    })
  }, [])

  const topicCards = useMemo(() => {
    return topicStats.map((t) => {
      const total = Math.max(0, Number(t.total) || 0)
      const correct = Math.max(0, Number(t.correct) || 0)
      const wrong = Math.max(0, Number(t.wrong) || 0)
      const pct = total ? Math.round((correct / total) * 100) : 0
      const topicLabel = t.topic_unit || ''
      return { ...t, total, correct, wrong, pct, topicLabel }
    })
  }, [topicStats])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Lịch sử học tập</h1>

      {loading ? (
        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Đang tải...</div>
      ) : error ? (
        <div className="text-sm text-red-600">{error}</div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Thống kê theo chủ đề</CardTitle>
        </CardHeader>
        <CardContent>
          {(!loading && !topicCards.length) ? (
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Chưa có dữ liệu thống kê.</div>
          ) : (
            <div className="space-y-3">
              {topicCards.map((t) => (
                <div key={t.topic_unit || t.topicLabel} className="border rounded-md p-3" style={{ borderColor: 'var(--divider)' }}>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold whitespace-normal break-words">{t.topicLabel}</div>
                      <div className="text-xs mt-1 flex flex-wrap items-center gap-2">
                        <span className="text-emerald-300 font-semibold">Đúng {t.correct}</span>
                        <span className="text-rose-300 font-semibold">Sai {t.wrong}</span>
                        <span style={{ color: 'var(--text-muted)' }}>({t.pct}%)</span>
                      </div>
                      <div className="mt-2 h-2 w-full rounded bg-slate-700/30 overflow-hidden flex">
                        <div className="h-full bg-emerald-500/70" style={{ width: `${t.pct}%` }} />
                        <div className="h-full bg-rose-500/70" style={{ width: `${Math.max(0, 100 - t.pct)}%` }} />
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      className="whitespace-nowrap"
                      onClick={() => {
                        if (!t.topic_unit) return
                        openPractice({ topic_unit: t.topic_unit }, `Luyện tập • ${t.topicLabel}`)
                      }}
                    >
                      Luyện tập ngay
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lịch sử các bài làm</CardTitle>
        </CardHeader>
        <CardContent>
          {(!loading && !attempts.length) ? (
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Chưa có bài đã làm.</div>
          ) : (
            <div className="space-y-2">
              {attempts.map((a) => (
                <div
                  key={a.id}
                  className="border rounded p-3 cursor-pointer hover:bg-slate-900/10 transition-colors"
                  style={{ borderColor: 'var(--divider)' }}
                  onClick={() => openAttemptDetail(a.id)}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="text-sm font-medium whitespace-normal break-words">{a.lesson_title || 'Bài làm'}</div>
                    <div className="flex gap-1 shrink-0">
                      {a.has_report && <span className="text-[10px] bg-red-100 text-red-600 px-1 rounded">Có báo cáo</span>}
                      {a.reviewed && <span className="text-[10px] bg-blue-100 text-blue-600 px-1 rounded">Đã xem</span>}
                      {a.has_adjustment && <span className="text-[10px] bg-green-100 text-green-600 px-1 rounded">Điểm đã cập nhật</span>}
                    </div>
                  </div>
                  <div className="text-xs text-slate-600 mt-1">
                    Điểm: {a.correct}/{a.total} ({a.percent}%)
                  </div>
                  {a.created_at ? (
                    <div className="text-xs text-slate-500">
                      Thời gian: {new Date(a.created_at).toLocaleString()}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedAttemptId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={closeAttemptDetail}>
          <div className="bg-slate-950/90 border border-slate-700/60 rounded-lg shadow-xl w-[900px] max-w-[100%] max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 bg-slate-900/60 border-b border-slate-700/60 flex justify-between items-center">
              <h3 className="font-semibold text-slate-100">Chi tiết bài làm</h3>
              <button className="text-slate-200/80 hover:text-slate-100" onClick={closeAttemptDetail}>✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {detailLoading ? (
                <div className="text-center py-10 text-slate-200/70">Đang tải...</div>
              ) : detailError ? (
                <div className="text-sm text-rose-200">{detailError}</div>
              ) : (
                <>
                  {selectedAttemptMeta && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="rounded-lg border border-slate-700/60 bg-slate-900/30 p-4">
                        <div className="text-xs text-slate-200/70">Tổng câu</div>
                        <div className="mt-1 text-2xl font-semibold text-slate-100">
                          {selectedAttemptMeta.total_questions || selectedAttemptMeta.accuracy_total_units || 0}
                        </div>
                      </div>
                      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4">
                        <div className="text-xs text-slate-200/70">Đúng</div>
                        <div className="mt-1 text-2xl font-semibold text-emerald-100">
                          {selectedAttemptMeta.correct_answers || selectedAttemptMeta.accuracy_correct_units || 0}
                        </div>
                      </div>
                      <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-4">
                        <div className="text-xs text-slate-200/70">Sai</div>
                        <div className="mt-1 text-2xl font-semibold text-rose-100">
                          {(selectedAttemptMeta.total_questions || selectedAttemptMeta.accuracy_total_units || 0) - (selectedAttemptMeta.correct_answers || selectedAttemptMeta.accuracy_correct_units || 0)}
                        </div>
                      </div>
                      <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-4">
                        <div className="text-xs text-slate-200/70">Tỉ lệ đúng</div>
                        <div className="mt-1 text-2xl font-semibold text-blue-100">
                          {selectedAttemptMeta.score_percent || selectedAttemptMeta.accuracy_percent || 0}%
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedAttemptFeedback?.feedback && (selectedAttemptFeedback.feedback.praise || selectedAttemptFeedback.feedback.strengths?.length > 0) ? (
                    <div className="space-y-4 p-5 rounded-lg border border-blue-500/20 bg-blue-500/10">
                      <h4 className="font-bold text-slate-100">✨ Nhận xét từ AI</h4>
                      {selectedAttemptFeedback.feedback.praise ? (
                        <p className="text-sm text-slate-100 italic">&ldquo;{selectedAttemptFeedback.feedback.praise}&rdquo;</p>
                      ) : null}
                      {selectedAttemptFeedback.feedback.strengths?.length > 0 ? (
                        <div>
                          <div className="text-xs font-bold text-slate-200/80 uppercase mt-2">Điểm mạnh:</div>
                          <ul className="list-disc list-inside text-sm text-slate-100 space-y-1">
                            {selectedAttemptFeedback.feedback.strengths.map((s: string, i: number) => <li key={i}>{s}</li>)}
                          </ul>
                        </div>
                      ) : null}
                      {selectedAttemptFeedback.feedback.plan?.length > 0 ? (
                        <div>
                          <div className="text-xs font-bold text-slate-200/80 uppercase mt-2">Kế hoạch học tập:</div>
                          <ul className="list-disc list-inside text-sm text-slate-100 space-y-1">
                            {selectedAttemptFeedback.feedback.plan.map((p: string, i: number) => <li key={i}>{p}</li>)}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {selectedAttemptFeedback?.short_answer_results?.length > 0 ? (
                    <div className="space-y-3">
                      <h4 className="font-bold text-rose-100">❌ Chi tiết các câu sai</h4>
                      <div className="space-y-3">
                        {selectedAttemptFeedback.short_answer_results.map((res: any, i: number) => (
                          <div key={i} className="p-4 border border-rose-500/20 bg-rose-500/10 rounded text-sm space-y-2 text-slate-100">
                            <div className="flex justify-between font-bold text-slate-100 gap-2">
                              <span>Câu hỏi {i + 1} (AI nhận xét)</span>
                              {res.is_correct === false ? (
                                <span className="text-xs bg-rose-500/20 border border-rose-500/20 px-2 py-0.5 rounded">Chưa chính xác</span>
                              ) : null}
                            </div>
                            <div>
                              <span className="font-bold">Bạn chọn:</span> <span className="text-rose-100">{res.chosen || '—'}</span>
                            </div>
                            <div>
                              <span className="font-bold">Đáp án đúng:</span> <span className="text-emerald-100">{res.correct || '—'}</span>
                            </div>
                            {res.comment ? (
                              <div className="italic text-slate-100/90 mt-1">&ldquo;{res.comment}&rdquo;</div>
                            ) : null}
                            {res.explain ? (
                              <div className="bg-slate-950/30 p-3 rounded mt-1 text-xs border border-slate-700/60">
                                <span className="font-bold">Giải thích:</span> {res.explain}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-4 pt-4 border-t border-slate-700/60">
                    <h4 className="font-bold text-slate-100">📋 Danh sách câu hỏi chi tiết</h4>
                    {(attemptDetail || []).map((item, idx) => {
                      const isWrong = item.is_correct === false || (Number(item.score_awarded ?? 0) < Number(item.max_score ?? 1))
                      const adjType = item.review_adjustment_type && item.review_adjustment_type !== 'none' ? item.review_adjustment_type : null
                      const canReport =
                        item.report_locked !== true &&
                        !item.report_id &&
                        !adjType &&
                        isWrong

                      const hasReported = !!item.report_id || !!item.report_status
                      const isReviewedKeep = item.review_status === 'reviewed_keep'
                      const isAdjusted = !!adjType
                      const statements = Array.isArray(item.statements) ? item.statements : []

                      return (
                        <div key={`${item.question_id || idx}`} className="border border-slate-700/60 rounded p-5 space-y-2 relative bg-slate-900/30 text-slate-100">
                          <div className="flex justify-between items-start gap-2">
                            <div className="text-sm font-bold text-slate-100">Câu {idx + 1}</div>
                            {canReport ? (
                              <button
                                className="text-xs bg-rose-500/10 text-rose-100 hover:bg-rose-500/15 px-2 py-1 rounded border border-rose-500/20 transition-colors flex items-center gap-1"
                                onClick={() => setReportModal({ qid: item.question_id, aid: selectedAttemptId, answer_id: item.answer_id || null })}
                              >
                                🚩 Báo cáo sai sót
                              </button>
                            ) : null}
                          </div>

                          <div className="text-sm whitespace-pre-wrap text-slate-100">{item.content}</div>

                          {statements.length > 0 ? (
                            <div className="mt-2 space-y-1 border-l-2 border-slate-700 pl-3">
                              {statements.map((st: any, i: number) => (
                                <div key={st.statement_id || i} className="text-xs flex items-start gap-2">
                                  <span className="font-bold w-4">{String.fromCharCode(97 + i)}.</span>
                                  <span className="flex-1 text-slate-100">{st.text}</span>
                                  <span className={st.is_correct ? 'text-emerald-200' : 'text-rose-200'}>
                                    Bạn chọn: {st.selected_answer === true ? 'Đúng' : st.selected_answer === false ? 'Sai' : '—'}
                                    {st.is_correct === true ? ' (Đúng)' : st.is_correct === false ? ' (Sai)' : ''}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : null}

                          <div className="text-xs space-y-1 mt-2">
                            {statements.length === 0 ? (
                              <div className="font-medium">
                                Đáp án của bạn:
                                <span className={item.is_correct ? 'text-emerald-200 ml-1' : 'text-rose-200 ml-1'}>
                                  {item.question_type === 'short_answer' ? (item.answer_text || '—') : (item.selected_answer || '—')}
                                  {item.is_correct === true ? ' (Đúng)' : item.is_correct === false ? ' (Sai)' : ''}
                                </span>
                              </div>
                            ) : null}

                            {hasReported && !isReviewedKeep && !isAdjusted ? (
                              <div className="flex items-center gap-1 text-amber-200 font-medium">
                                <span className="text-[10px] bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">Đã gửi báo cáo - đang chờ giáo viên xem</span>
                              </div>
                            ) : null}

                            {isReviewedKeep ? (
                              <div className="flex items-center gap-1 text-slate-200/80 font-medium">
                                <span className="text-[10px] bg-slate-900/40 border border-slate-700/60 px-1.5 py-0.5 rounded">Giáo viên đã xem và giữ nguyên đáp án</span>
                              </div>
                            ) : null}

                            {adjType === 'wrong_answer_regrade' ? (
                              <div className="text-emerald-100 font-medium bg-emerald-500/10 p-3 rounded mt-2 border border-emerald-500/20">
                                <span className="font-bold">✨ Giáo viên đã sửa đáp án:</span> Điểm của bạn đã được cập nhật.
                                {item.review_adjustment_note ? <div className="mt-1 text-slate-100/80 font-normal">&ldquo;{item.review_adjustment_note}&rdquo;</div> : null}
                              </div>
                            ) : null}

                            {adjType === 'wrong_question_full_credit' ? (
                              <div className="text-blue-100 font-medium bg-blue-500/10 p-3 rounded mt-2 border border-blue-500/20">
                                <span className="font-bold">✨ Câu hỏi có lỗi:</span> Bạn đã được cộng tối đa điểm câu này.
                                {item.review_adjustment_note ? <div className="mt-1 text-slate-100/80 font-normal">&ldquo;{item.review_adjustment_note}&rdquo;</div> : null}
                              </div>
                            ) : null}
                          </div>

                          {(item.tip || item.explanation) ? (
                            <div className="mt-2 p-3 bg-slate-950/20 border border-slate-700/60 rounded text-xs space-y-1 text-slate-100">
                              {item.tip ? <div><span className="font-bold">Mẹo:</span> {item.tip}</div> : null}
                              {item.explanation ? <div><span className="font-bold">Giải thích:</span> {item.explanation}</div> : null}
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {reportModal ? (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={() => setReportModal(null)}>
          <div className="bg-white rounded shadow-xl w-[420px] max-w-[100%] p-4 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-lg border-b pb-2">Báo cáo câu hỏi</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm block mb-1">Lý do báo cáo <span className="text-red-500">*</span></label>
                <select
                  className="w-full border rounded p-2 text-sm"
                  value={reportReason}
                  onChange={e => setReportReason(e.target.value)}
                >
                  <option value="">-- Chọn lý do --</option>
                  <option value="Em nghĩ đáp án đúng phải là lựa chọn khác">Em nghĩ đáp án đúng phải là lựa chọn khác</option>
                  <option value="Giải thích hiện tại chưa hợp lí">Giải thích hiện tại chưa hợp lí</option>
                  <option value="Câu hỏi mơ hồ / thiếu dữ kiện">Câu hỏi mơ hồ / thiếu dữ kiện</option>
                  <option value="Hình ảnh hoặc dữ kiện bị lỗi">Hình ảnh hoặc dữ kiện bị lỗi</option>
                  <option value="Khác">Khác</option>
                </select>
              </div>
              <div>
                <label className="text-sm block mb-1">Chi tiết thêm (không bắt buộc)</label>
                <textarea
                  className="w-full border rounded p-2 text-sm min-h-[100px]"
                  placeholder="Mô tả cụ thể lỗi bạn phát hiện (tối đa 500 ký tự)..."
                  maxLength={500}
                  value={reportDetailText}
                  onChange={e => setReportDetailText(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button className="px-4 py-2 text-sm border rounded" onClick={() => setReportModal(null)}>Hủy</button>
              <button
                className="px-4 py-2 text-sm bg-red-600 text-white rounded disabled:opacity-50"
                disabled={!reportReason || reporting}
                onClick={handleReport}
              >
                {reporting ? 'Đang gửi...' : 'Gửi báo cáo'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {practiceOpen ? (
        <div className="fixed inset-0 bg-black/70 z-[70] flex items-center justify-center p-4" onClick={() => setPracticeOpen(false)}>
          <div className="w-full max-w-4xl max-h-[90vh] overflow-auto rounded-lg border border-slate-700/60 bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-700/60 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-lg font-semibold whitespace-normal break-words text-slate-100">{practiceTitle || 'Luyện tập'}</div>
                <div className="text-xs text-slate-200/70">Chọn đáp án để xem kết quả ngay, kèm mẹo và giải thích.</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setPracticeOpen(false)}>Đóng</Button>
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
                    const imageBlock = pq.image_url ? (
                      <div className="space-y-2">
                        <img
                          src={pq.image_url}
                          alt={pq.image_alt || 'Hình minh hoạ'}
                          className="w-full max-h-72 object-contain rounded-md border"
                          style={{ borderColor: 'var(--divider)' }}
                        />
                        {pq.image_caption ? (
                          <div className="text-sm text-gray-200/70">{pq.image_caption}</div>
                        ) : null}
                      </div>
                    ) : null

                    const showExplain = !!st.revealed

                    if (pq.question_type === 'single_choice' || pq.question_type === 'true_false') {
                      const options = Array.isArray(pq.options) ? pq.options : []
                      const correctKey = options.find(o => o.is_correct)?.key || null
                      const chosen = st.chosen || null
                      const done = !!chosen
                      const ok = done ? (chosen && correctKey ? chosen === correctKey : null) : null
                      return (
                        <Card key={pq.question_id} className="border border-slate-700/60 bg-slate-900/30">
                          <CardContent className="p-5 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-bold text-slate-100">Câu luyện {i + 1}</div>
                                <div className="text-sm text-slate-100 whitespace-pre-wrap">{pq.content}</div>
                              </div>
                              {done ? (
                                <div className={ok ? 'text-emerald-200 text-xs font-semibold shrink-0' : 'text-rose-200 text-xs font-semibold shrink-0'}>
                                  {ok ? 'Đúng' : 'Sai'}
                                </div>
                              ) : null}
                            </div>
                            {imageBlock}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                              {options.map((o) => {
                                const isPicked = chosen === o.key
                                const isCorrect = !!o.is_correct
                                const cls = done
                                  ? (isCorrect ? 'border-emerald-500/30 bg-emerald-500/10' : isPicked ? 'border-rose-500/30 bg-rose-500/10' : 'border-slate-700/60 bg-slate-900/20')
                                  : (isPicked ? 'border-blue-500/30 bg-blue-500/10' : 'border-slate-700/60 bg-slate-900/20')
                                return (
                                  <button
                                    key={o.key}
                                    className={`rounded-md border p-3 text-left transition-colors ${cls}`}
                                    onClick={() => {
                                      patchPracticeState(pq.question_id, { chosen: o.key, revealed: true })
                                    }}
                                  >
                                    <div className="font-semibold text-slate-100">
                                      {o.key}. <span className="font-normal">{o.text}</span>
                                    </div>
                                  </button>
                                )
                              })}
                            </div>
                            {showExplain && (pq.tip || pq.explanation) ? (
                              <div className="mt-2 p-3 bg-slate-950/20 border border-slate-700/60 rounded text-xs space-y-1 text-slate-100">
                                {pq.tip ? <div><span className="font-bold">Mẹo:</span> {pq.tip}</div> : null}
                                {pq.explanation ? <div><span className="font-bold">Giải thích:</span> {pq.explanation}</div> : null}
                              </div>
                            ) : null}
                          </CardContent>
                        </Card>
                      )
                    }

                    if (pq.question_type === 'short_answer') {
                      const accepted = (pq.accepted_answers || []).map(a => normalizeText(a.text)).filter(Boolean)
                      const userText = String(st.text || '')
                      const userNorm = normalizeText(userText)
                      const done = showExplain || !!userNorm
                      const ok = (done && userNorm && accepted.length) ? accepted.includes(userNorm) : null
                      return (
                        <Card key={pq.question_id} className="border border-slate-700/60 bg-slate-900/30">
                          <CardContent className="p-5 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-bold text-slate-100">Câu luyện {i + 1}</div>
                                <div className="text-sm text-slate-100 whitespace-pre-wrap">{pq.content}</div>
                              </div>
                              {done && ok != null ? (
                                <div className={ok ? 'text-emerald-200 text-xs font-semibold shrink-0' : 'text-rose-200 text-xs font-semibold shrink-0'}>
                                  {ok ? 'Đúng' : 'Sai'}
                                </div>
                              ) : null}
                            </div>
                            {imageBlock}
                            <input
                              className="w-full rounded-md border border-slate-700/60 bg-slate-900/20 px-3 py-2 text-sm text-slate-100"
                              placeholder="Nhập đáp án..."
                              value={userText}
                              onChange={(e) => patchPracticeState(pq.question_id, { text: e.target.value })}
                            />
                            <div className="flex items-center gap-2">
                              <Button variant="outline" size="sm" onClick={() => patchPracticeState(pq.question_id, { revealed: true })}>
                                Kiểm tra
                              </Button>
                              {accepted.length ? (
                                <div className="text-xs text-slate-200/70">
                                  Đáp án tham khảo: <span className="text-slate-100">{accepted.join(' | ')}</span>
                                </div>
                              ) : null}
                            </div>
                            {showExplain && (pq.tip || pq.explanation) ? (
                              <div className="mt-2 p-3 bg-slate-950/20 border border-slate-700/60 rounded text-xs space-y-1 text-slate-100">
                                {pq.tip ? <div><span className="font-bold">Mẹo:</span> {pq.tip}</div> : null}
                                {pq.explanation ? <div><span className="font-bold">Giải thích:</span> {pq.explanation}</div> : null}
                              </div>
                            ) : null}
                          </CardContent>
                        </Card>
                      )
                    }

                    if (pq.question_type === 'true_false_group') {
                      const statements = (pq.statements || []).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                      const picked: Record<string, boolean | null> = st.picked || {}
                      const done = showExplain
                      const setPicked = (statementId: string, val: boolean) => {
                        patchPracticeState(pq.question_id, { picked: { ...picked, [statementId]: val }, revealed: true })
                      }
                      return (
                        <Card key={pq.question_id} className="border border-slate-700/60 bg-slate-900/30">
                          <CardContent className="p-5 space-y-3">
                            <div className="text-sm font-bold text-slate-100">Câu luyện {i + 1}</div>
                            <div className="text-sm text-slate-100 whitespace-pre-wrap">{pq.content}</div>
                            {imageBlock}
                            <div className="space-y-2">
                              {statements.map((s, idx2) => {
                                const pv = (picked[s.statement_id] ?? null) as boolean | null
                                const ok = (pv != null && s.correct_answer != null) ? pv === s.correct_answer : null
                                return (
                                  <div key={s.statement_id} className="rounded-md border border-slate-700/60 bg-slate-900/20 p-3 space-y-2">
                                    <div className="text-sm text-slate-100 whitespace-pre-wrap">
                                      <span className="font-semibold mr-1">{String.fromCharCode(97 + idx2)}.</span>
                                      {s.text}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <button
                                        className={`px-3 py-1.5 rounded border text-xs ${pv === true ? 'border-blue-400/40 bg-blue-500/20 text-blue-100' : 'border-slate-700/60 text-slate-100'}`}
                                        onClick={() => setPicked(s.statement_id, true)}
                                      >
                                        Đúng
                                      </button>
                                      <button
                                        className={`px-3 py-1.5 rounded border text-xs ${pv === false ? 'border-blue-400/40 bg-blue-500/20 text-blue-100' : 'border-slate-700/60 text-slate-100'}`}
                                        onClick={() => setPicked(s.statement_id, false)}
                                      >
                                        Sai
                                      </button>
                                      {done && ok != null ? (
                                        <span className={ok ? 'text-emerald-200 text-xs font-semibold' : 'text-rose-200 text-xs font-semibold'}>
                                          {ok ? 'Đúng' : 'Sai'}
                                        </span>
                                      ) : null}
                                      {done && s.correct_answer != null ? (
                                        <span className="text-xs text-slate-200/70">
                                          Đáp án: <span className="text-slate-100">{s.correct_answer ? 'Đúng' : 'Sai'}</span>
                                        </span>
                                      ) : null}
                                    </div>
                                    {done && (s.tip || s.explanation) ? (
                                      <div className="mt-1 p-3 bg-slate-950/20 border border-slate-700/60 rounded text-xs space-y-1 text-slate-100">
                                        {s.tip ? <div><span className="font-bold">Mẹo:</span> {s.tip}</div> : null}
                                        {s.explanation ? <div><span className="font-bold">Giải thích:</span> {s.explanation}</div> : null}
                                      </div>
                                    ) : null}
                                  </div>
                                )
                              })}
                            </div>
                          </CardContent>
                        </Card>
                      )
                    }

                    return (
                      <Card key={pq.question_id} className="border border-slate-700/60 bg-slate-900/30">
                        <CardContent className="p-5 space-y-3">
                          <div className="text-sm font-bold text-slate-100">Câu luyện {i + 1}</div>
                          <div className="text-sm text-slate-100 whitespace-pre-wrap">{pq.content}</div>
                          {imageBlock}
                          <Button variant="outline" size="sm" onClick={() => patchPracticeState(pq.question_id, { revealed: true })}>
                            Hiện đáp án / Giải thích
                          </Button>
                          {showExplain && (pq.tip || pq.explanation) ? (
                            <div className="mt-2 p-3 bg-slate-950/20 border border-slate-700/60 rounded text-xs space-y-1 text-slate-100">
                              {pq.tip ? <div><span className="font-bold">Mẹo:</span> {pq.tip}</div> : null}
                              {pq.explanation ? <div><span className="font-bold">Giải thích:</span> {pq.explanation}</div> : null}
                            </div>
                          ) : null}
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
    </div>
  )
}
