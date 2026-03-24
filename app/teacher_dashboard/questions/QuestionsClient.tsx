'use client'

import { useEffect, useMemo, useState } from 'react'

type QuestionOption = {
  key: string
  text: string
  is_correct: boolean
  order: number
  image_url?: string
  image_alt?: string
  image_caption?: string
}

type QuestionStatement = {
  id?: string
  key: string
  text: string
  correct_answer: boolean
  order: number
  score?: number
  explanation?: string
  tip?: string
}

type ShortAnswerMeta = {
  id?: string
  answer_text: string
  score?: number
  explanation?: string
  tip?: string
}

type QuestionRow = {
  question_id: string
  lesson_id: string
  question_content: string
  brief_content?: string
  question_type: string
  lesson_title: string
  grade_name: string
  total_attempts: number
  correct_attempts?: number
  correct_rate: number
  difficulty?: string | number | null
  topic?: string
  order_index?: number | null
  exam_score?: number | null
  tip?: string
  explanation?: string
  brief_explanation?: string
  image_url?: string
  image_alt?: string
  image_caption?: string
  media?: any[]
  options?: QuestionOption[]
  correct_key?: string
  statements?: QuestionStatement[]
  statement_count?: number
  accepted_answers?: string[]
  short_answer_meta?: ShortAnswerMeta[]
  report_count?: number
  review_status?: string
  resolution_type?: string
  report_locked?: boolean
  last_reported_at?: string
  last_reviewed_at?: string
  last_review_note?: string
}

type SortKey =
  | 'total_attempts'
  | 'correct_rate'
  | 'grade_name'
  | 'lesson_title'
  | 'report_count'
  | 'last_reported_at'

type LessonMeta = {
  id: string
  title: string
  grade_id?: string
  grade_name?: string
}

function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function typeLabel(questionType: string) {
  if (questionType === 'single_choice') return 'Trắc nghiệm'
  if (questionType === 'true_false_group') return 'Đúng/Sai'
  if (questionType === 'short_answer') return 'Tự luận'
  return questionType || '—'
}

export default function QuestionsClient() {
  const [rows, setRows] = useState<QuestionRow[]>([])
  const [loading, setLoading] = useState(false)
  const [metaLoading, setMetaLoading] = useState(false)
  const [error, setError] = useState('')

  const [grade, setGrade] = useState<string>('all')
  const [lesson, setLesson] = useState<string>('all')
  const [type, setType] = useState<string>('all')
  const [status, setStatus] = useState<string>('all')
  const [search, setSearch] = useState('')

  const [sortKey, setSortKey] = useState<SortKey>('report_count')
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc')

  const [page, setPage] = useState(1)
  const pageSize = 20
  const [total, setTotal] = useState(0)

  const [detail, setDetail] = useState<QuestionRow | null>(null)
  const [detailIndex, setDetailIndex] = useState<number | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [reports, setReports] = useState<any[]>([])

  const [editContent, setEditContent] = useState('')
  const [editTip, setEditTip] = useState('')
  const [editExplanation, setEditExplanation] = useState('')
  const [editOptions, setEditOptions] = useState<QuestionOption[]>([])
  const [editStatements, setEditStatements] = useState<QuestionStatement[]>([])
  const [editAcceptedAnswers, setEditAcceptedAnswers] = useState<string[]>([])
  const [reviewType, setReviewType] = useState<'keep' | 'wrong_answer' | 'wrong_question' | null>(null)
  const [changeNote, setChangeNote] = useState('')
  const [aiGenerated, setAiGenerated] = useState(false)
  const [newQuestionId, setNewQuestionId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [genLoading, setGenLoading] = useState(false)

  const [gradesMeta, setGradesMeta] = useState<string[]>([])
  const [lessonsMeta, setLessonsMeta] = useState<LessonMeta[]>([])

  const typeFilterOptions = useMemo(
    () => [
      { value: 'all', label: 'Tất cả' },
      { value: 'single_choice', label: 'Trắc nghiệm' },
      { value: 'true_false_group', label: 'Đúng/Sai' },
      { value: 'short_answer', label: 'Tự luận' },
    ],
    []
  )

  const statusFilterOptions = useMemo(
    () => [
      { value: 'all', label: 'Tất cả' },
      { value: 'reported', label: 'Đang bị report' },
      { value: 'processed', label: 'Đã xử lí' },
      { value: 'not_reported', label: 'Chưa report' },
    ],
    []
  )

  useEffect(() => {
    let cancelled = false
    setMetaLoading(true)

    fetch('/api/teacher/questions/meta', {
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    })
      .then(async (r) => {
        const json = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(json?.error || 'Failed to load meta')
        return json
      })
      .then((json) => {
        if (cancelled) return
        setGradesMeta(safeArray<string>(json?.grades))
        setLessonsMeta(safeArray<LessonMeta>(json?.lessons))
      })
      .catch(() => {
        if (cancelled) return
        setGradesMeta([])
        setLessonsMeta([])
      })
      .finally(() => {
        if (!cancelled) setMetaLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')

    const qs = new URLSearchParams()
    qs.set('page', String(page))
    qs.set('page_size', String(pageSize))
    qs.set('sort_key', sortKey)
    qs.set('sort_dir', sortDir)

    if (grade !== 'all') qs.set('grade_name', grade)
    if (lesson !== 'all') qs.set('lesson_id', lesson)
    if (type !== 'all') qs.set('question_type', type)
    if (status !== 'all') qs.set('review_status', status)
    if (search.trim()) qs.set('search', search.trim())

    fetch(`/api/teacher/questions?${qs.toString()}`, {
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    })
      .then(async (r) => {
        const json = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(json?.error || 'Failed to load questions')
        return json
      })
      .then((json) => {
        if (cancelled) return
        setRows(safeArray<QuestionRow>(json?.questions))
        setTotal(Number(json?.total || 0))
      })
      .catch((err) => {
        if (cancelled) return
        setRows([])
        setTotal(0)
        setError(err?.message || 'Lỗi tải dữ liệu câu hỏi')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [page, sortKey, sortDir, grade, lesson, type, search])

  const filteredLessons = useMemo(() => {
    if (grade === 'all') return lessonsMeta
    return lessonsMeta.filter((l) => l.grade_name === grade)
  }, [lessonsMeta, grade])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const openDetail = (row: QuestionRow, idx: number) => {
    setDetailIndex(idx)
    setDetailLoading(true)
    setDetail(null) // Reset detail before loading new one
    setReports([])
    setEditContent('')
    setEditTip('')
    setEditExplanation('')
    setEditOptions([])
    setEditStatements([])
    setEditAcceptedAnswers([])
    setReviewType(null)
    setChangeNote('')
    setAiGenerated(false)
    setNewQuestionId(null)
    
    fetch(`/api/teacher/questions/${row.question_id}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        
        const { question: q, stats, options, statements, short_answers, reports: qReports } = data
        
        const mappedDetail: QuestionRow = {
          ...q,
          question_id: q.id,
          options: options.map((o: any) => ({
            key: o.option_key,
            text: o.option_text,
            is_correct: o.is_correct,
            order: o.sort_order,
            image_url: o.image_url,
            image_alt: o.image_alt,
            image_caption: o.image_caption
          })),
          statements: statements.map((s: any) => ({
            id: s.id,
            key: s.statement_key,
            text: s.statement_text,
            correct_answer: s.correct_answer,
            order: s.sort_order,
            score: s.score,
            explanation: s.explanation,
            tip: s.tip
          })),
          short_answer_meta: short_answers,
          accepted_answers: short_answers.map((sa: any) => sa.answer_text),
          total_attempts: stats.total_attempts,
          correct_attempts: stats.correct_attempts,
          correct_rate: stats.correct_rate
        }

        setDetail(mappedDetail)
        setReports(qReports || [])
        
        // Map to edit state
        setEditContent(q.content || '')
        setEditTip(q.tip || '')
        setEditExplanation(q.explanation || '')
        setEditOptions(mappedDetail.options || [])
        setEditStatements(mappedDetail.statements || [])
        setEditAcceptedAnswers(mappedDetail.accepted_answers || [])
        
      })
      .catch(err => {
        alert('Lỗi khi tải chi tiết: ' + err.message)
      })
      .finally(() => {
        setDetailLoading(false)
      })
  }

  const closeDetail = () => {
    setDetail(null)
    setDetailIndex(null)
    setReports([])
    setReviewType(null)
  }

  const handleGenTipExp = async () => {
    if (!detail) return
    setGenLoading(true)
    try {
      const reqPayload = {
        question_type: detail.question_type,
        content: editContent,
        brief_content: detail.brief_content,
        topic: detail.topic,
        difficulty: detail.difficulty,
        exam_score: detail.exam_score,
        options: editOptions,
        statements: editStatements,
        short_answers: editAcceptedAnswers.map(text => ({ answer_text: text })),
        explanation: editExplanation,
        tip: editTip
      }
      const res = await fetch('/api/teacher/questions/gen-tip-explanation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqPayload)
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || 'Gen AI failed')
      }
      const nextTip = typeof data?.tip === 'string' ? data.tip : ''
      const nextExp = typeof data?.explanation === 'string' ? data.explanation : ''
      setEditTip(nextTip)
      setEditExplanation(nextExp)
      setAiGenerated(true)
    } catch (err: any) {
      alert('Lỗi khi gen AI: ' + err.message)
    } finally {
      setGenLoading(false)
    }
  }

  const handleSaveReview = async () => {
    if (!detail || !reviewType) {
      alert('Vui lòng chọn loại thay đổi')
      return
    }

    if (reviewType !== 'keep') {
      // Validation
      if (detail.question_type === 'single_choice') {
        const correctCount = editOptions.filter(o => o.is_correct).length
        if (correctCount !== 1) {
          alert('Câu trắc nghiệm phải có đúng 1 đáp án đúng.')
          return
        }
      }
    }

    const confirmMsg =
      reviewType === 'keep'
        ? 'Hệ thống sẽ đánh dấu đã xem, khóa report, và không chấm lại điểm. Bạn có chắc chắn?'
        : reviewType === 'wrong_answer'
          ? 'Hệ thống sẽ chấm lại câu này cho toàn bộ học sinh đã làm câu hỏi này dựa trên đáp án mới. Bạn có chắc chắn?'
          : 'Hệ thống sẽ cộng tối đa điểm câu này cho toàn bộ học sinh đã làm câu hỏi này, không phụ thuộc đáp án mà học sinh đã chọn. Bạn có chắc chắn?'

    if (!confirm(confirmMsg)) return

    setSaving(true)
    try {
      const payload = {
        change_type: reviewType,
        change_note: changeNote || null,
        ai_generated_tip_explanation: aiGenerated,
        ai_model: aiGenerated ? 'gpt-4o-mini' : null,
        ai_prompt_version: aiGenerated ? 'tip_explain_v1' : null,
        question: {
          content: editContent,
          brief_content: detail.brief_content,
          tip: editTip,
          explanation: editExplanation,
          topic: detail.topic,
          difficulty: detail.difficulty,
          exam_score: detail.exam_score,
          image_url: detail.image_url,
          image_alt: detail.image_alt,
          image_caption: detail.image_caption
        },
        options: detail.question_type === 'single_choice' ? editOptions.map(o => ({
          option_key: o.key,
          option_text: o.text,
          is_correct: o.is_correct,
          sort_order: o.order,
          image_url: o.image_url,
          image_alt: o.image_alt,
          image_caption: o.image_caption
        })) : [],
        statements: (detail.question_type === 'true_false_group' || detail.question_type === 'true_false') ? editStatements.map(s => ({
          id: s.id,
          statement_key: s.key,
          statement_text: s.text,
          correct_answer: s.correct_answer,
          score: s.score,
          sort_order: s.order,
          explanation: s.explanation,
          tip: s.tip
        })) : [],
        short_answers: detail.question_type === 'short_answer' ? editAcceptedAnswers.map((text, i) => {
          const meta = detail.short_answer_meta?.[i]
          return {
            id: meta?.id,
            answer_text: text,
            score: meta?.score ?? 1,
            explanation: meta?.explanation || '',
            tip: meta?.tip || ''
          }
        }) : [],
        new_question_id: newQuestionId
      }

      const res = await fetch(`/api/teacher/questions/${detail.question_id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (data.success) {
        alert(`Đã lưu thành công! Revision ID: ${data.revision_id}`)
        // Refresh the list row
        setRows(prev => prev.map(r => r.question_id === detail.question_id ? { ...r, review_status: data.review_status || r.review_status } : r))
        closeDetail()
      } else {
        alert('Lỗi khi lưu: ' + (data.error || 'Unknown error'))
      }
    } catch (err: any) {
      alert('Lỗi khi lưu: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const goPrevDetail = () => {
    if (detailIndex == null) return
    const prev = Math.max(0, detailIndex - 1)
    const row = rows[prev]
    if (row) {
      openDetail(row, prev)
    }
  }

  const goNextDetail = () => {
    if (detailIndex == null) return
    const next = Math.min(rows.length - 1, detailIndex + 1)
    const row = rows[next]
    if (row) {
      openDetail(row, next)
    }
  }

  return (
    <div className="space-y-4">
      <style jsx>{`
        .question-cell {
          max-width: 600px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .badge {
          background: #1e293b;
          border-radius: 6px;
          padding: 2px 8px;
          font-size: 12px;
          display: inline-block;
        }
        table thead th {
          position: sticky;
          top: 0;
          background: var(--background);
          z-index: 1;
        }
        table tbody tr:hover {
          background: #1e293b;
        }
      `}</style>

      <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
        Phạm vi: <span className="font-medium">Toàn hệ thống</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <label className="text-sm">Khối</label>
          <select
            className="border rounded p-2 bg-transparent select-clean"
            value={grade}
            onChange={(e) => {
              setPage(1)
              setGrade(e.target.value)
              setLesson('all')
            }}
            disabled={metaLoading}
          >
            <option value="all">Tất cả</option>
            {gradesMeta.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm">Bài học</label>
          <select
            className="border rounded p-2 bg-transparent select-clean"
            value={lesson}
            onChange={(e) => {
              setPage(1)
              setLesson(e.target.value)
            }}
            disabled={metaLoading}
          >
            <option value="all">Tất cả</option>
            {filteredLessons.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm">Loại</label>
          <select
            className="border rounded p-2 bg-transparent select-clean"
            value={type}
            onChange={(e) => {
              setPage(1)
              setType(e.target.value)
            }}
          >
            {typeFilterOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm">Trạng thái</label>
          <select
            className="border rounded p-2 bg-transparent select-clean"
            value={status}
            onChange={(e) => {
              setPage(1)
              setStatus(e.target.value)
            }}
          >
            {statusFilterOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm">Sort</label>
          <select
            className="border rounded p-2 bg-transparent select-clean"
            value={sortKey}
            onChange={(e) => {
              setPage(1)
              setSortKey(e.target.value as SortKey)
            }}
          >
            <option value="report_count">Số report</option>
            <option value="last_reported_at">Report gần nhất</option>
            <option value="total_attempts">Số lần làm</option>
            <option value="correct_rate">Tỉ lệ đúng</option>
            <option value="grade_name">Khối</option>
            <option value="lesson_title">Bài học</option>
          </select>

          <select
            className="border rounded p-2 bg-transparent select-clean"
            value={sortDir}
            onChange={(e) => {
              setPage(1)
              setSortDir(e.target.value as 'asc' | 'desc')
            }}
          >
            <option value="desc">Giảm dần</option>
            <option value="asc">Tăng dần</option>
          </select>
        </div>

        <div className="flex-1 min-w-[220px]">
          <input
            className="w-full border rounded p-2 bg-transparent"
            placeholder="Tìm theo nội dung câu hỏi..."
            value={search}
            onChange={(e) => {
              setPage(1)
              setSearch(e.target.value)
            }}
          />
        </div>
      </div>

      {error ? <div className="text-red-500 text-sm">{error}</div> : null}

      <div className="overflow-x-auto">
        <table className="w-full border rounded" style={{ borderColor: 'var(--divider)' }}>
          <colgroup>
            <col style={{ width: '5%' }} />
            <col style={{ width: '24%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '9%' }} />
          </colgroup>
          <thead>
            <tr>
              <th className="text-left p-2">#</th>
              <th className="text-left p-2">Câu hỏi</th>
              <th className="text-left p-2">Bài học</th>
              <th className="text-left p-2">Khối</th>
              <th className="text-left p-2">Loại</th>
              <th className="text-left p-2">Số lần làm</th>
              <th className="text-left p-2">Tỉ lệ đúng</th>
              <th className="text-left p-2">Report</th>
              <th className="text-left p-2">Status</th>
              <th className="text-left p-2">Hành động</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td className="p-3 text-sm" colSpan={10}>
                  Đang tải...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="p-3 text-sm" style={{ color: 'var(--text-muted)' }} colSpan={10}>
                  Chưa có dữ liệu câu hỏi
                </td>
              </tr>
            ) : (
              rows.map((q, idx) => {
                const rank = (page - 1) * pageSize + idx + 1
                const rate = Number(q.correct_rate || 0)

                let rateColor = '#16a34a'
                if (rate < 40) rateColor = '#ef4444'
                else if (rate < 70) rateColor = '#f59e0b'
                else rateColor = '#22c55e'

                const reportCount = Number(q.report_count || 0)
                const reviewStatus = q.review_status || 'normal'

                return (
                  <tr key={q.question_id || `${idx}`}>
                    <td className="p-2">{rank}</td>
                    <td className="p-2">
                      <div className="question-cell">{q.question_content || '—'}</div>
                    </td>
                    <td className="p-2">
                      <span className="badge">{q.lesson_title || '—'}</span>
                    </td>
                    <td className="p-2">
                      <span className="badge">{q.grade_name || '—'}</span>
                    </td>
                    <td className="p-2">
                      <span className="badge">{typeLabel(q.question_type)}</span>
                    </td>
                    <td className="p-2">{Number(q.total_attempts || 0)}</td>
                    <td className="p-2" style={{ color: rateColor }}>
                      {rate.toFixed(2)}%
                    </td>
                    <td className="p-2">
                      {reportCount > 0 ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-600 text-white">
                          {reportCount}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="p-2">
                      {reviewStatus === 'reported' && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-yellow-500 text-black">
                          reported
                        </span>
                      )}
                      {reviewStatus === 'reviewed_keep' && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-gray-500 text-white">
                          kept
                        </span>
                      )}
                      {reviewStatus === 'reviewed_answer_fixed' && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-green-600 text-white">
                          fixed
                        </span>
                      )}
                      {reviewStatus === 'reviewed_question_replaced' && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-600 text-white">
                          replaced
                        </span>
                      )}
                      {reviewStatus === 'normal' && (
                        <span className="text-xs text-gray-500">—</span>
                      )}
                    </td>
                    <td className="p-2">
                      <button
                        className="border rounded px-2 py-1 text-sm"
                        onClick={() => openDetail(q, idx)}
                      >
                        👁 Xem
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>

        <div className="flex items-center justify-end gap-2 mt-2">
          <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Tổng {total} câu
          </div>
          <button
            className="border rounded px-3 py-2"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Trang trước
          </button>
          <div className="text-sm">
            Trang {page}/{Math.max(1, totalPages)}
          </div>
          <button
            className="border rounded px-3 py-2"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Trang sau
          </button>
        </div>
      </div>

      {detail || detailLoading ? (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={closeDetail}
        >
          <div
            className="rounded shadow w-[1000px] max-w-[95%] max-h-[90vh] overflow-y-auto flex flex-col"
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#1e293b', color: '#ffffff' }}
          >
            <div
              className="flex items-center justify-between px-4 py-3 sticky top-0 z-10"
              style={{ background: '#2563eb' }}
            >
              <h3 className="text-lg font-semibold">Xử lí review câu hỏi</h3>
              <button
                aria-label="Đóng"
                className="rounded p-1 text-sm"
                onClick={closeDetail}
                style={{ background: 'transparent', color: '#ffffff' }}
              >
                ✕
              </button>
            </div>

            {detailLoading ? (
              <div className="flex-1 p-20 text-center text-slate-400">
                <div className="animate-spin text-3xl mb-4">⌛</div>
                Đang tải chi tiết câu hỏi...
              </div>
            ) : detail ? (
              <>
                <div className="flex-1 p-4 space-y-6">
                  {/* Metadata */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded" style={{ background: '#0f172a' }}>
                    <div>
                      <div className="text-xs text-slate-400">Bài học</div>
                      <div className="font-medium text-blue-400">{detail.lesson_title}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">Khối</div>
                      <div className="font-medium text-blue-400">{detail.grade_name}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">Loại</div>
                      <div className="font-medium">{typeLabel(detail.question_type)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">Attempts / Rate</div>
                      <div className="font-medium">{detail.total_attempts} / {Number(detail.correct_rate || 0).toFixed(1)}%</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">Số report</div>
                      <div className="font-medium text-red-400">{reports.length > 0 ? reports.length : (detail.report_count || 0)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">Trạng thái review</div>
                      <div className="font-medium">{detail.review_status || 'normal'}</div>
                    </div>
                  </div>

                  {/* List of Reports */}
                  {reports.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-semibold text-red-400">Danh sách báo cáo từ học sinh</h4>
                      <div className="max-h-40 overflow-y-auto space-y-2">
                        {reports.map((r, i) => (
                          <div key={r.id || i} className="p-2 border rounded border-red-900/50 bg-red-900/10 text-xs">
                            <div className="flex justify-between font-medium">
                              <span>{r.report_reason}</span>
                              <span className="text-slate-400">{new Date(r.created_at).toLocaleString()}</span>
                            </div>
                            {r.report_detail && <div className="mt-1 italic">&ldquo;{r.report_detail}&rdquo;</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Editing Area */}
                  <div className="space-y-4">
                    <h4 className="font-semibold border-b pb-1 border-slate-700">Nội dung chỉnh sửa</h4>
                    
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Nội dung câu hỏi</label>
                      <textarea
                        className="w-full border rounded p-3 bg-slate-900 border-slate-700 min-h-[100px]"
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                      />
                    </div>

                    {/* Options / Statements / Short Answers */}
                    {detail.question_type === 'single_choice' && (
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Các lựa chọn (Tích chọn đáp án đúng)</label>
                        <div className="space-y-2">
                          {editOptions.map((opt, i) => (
                            <div key={opt.key || i} className="flex items-center gap-2">
                              <input
                                type="radio"
                                name="correct_choice"
                                checked={opt.is_correct}
                                onChange={() => {
                                  const next = editOptions.map((o, idx) => ({ ...o, is_correct: i === idx }))
                                  setEditOptions(next)
                                }}
                              />
                              <span className="w-6 font-bold">{opt.key || String.fromCharCode(65 + i)}.</span>
                              <input
                                className="flex-1 border rounded p-2 bg-slate-900 border-slate-700"
                                value={opt.text}
                                onChange={(e) => {
                                  const next = [...editOptions]
                                  next[i].text = e.target.value
                                  setEditOptions(next)
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {(detail.question_type === 'true_false_group' || detail.question_type === 'true_false') && (
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Các mệnh đề (Tích chọn nếu mệnh đề là ĐÚNG)</label>
                        <div className="space-y-2">
                          {editStatements.map((st, i) => (
                            <div key={st.id || i} className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={st.correct_answer}
                                onChange={(e) => {
                                  const next = [...editStatements]
                                  next[i].correct_answer = e.target.checked
                                  setEditStatements(next)
                                }}
                              />
                              <span className="w-6 font-bold">{st.key || String.fromCharCode(97 + i)}.</span>
                              <input
                                className="flex-1 border rounded p-2 bg-slate-900 border-slate-700"
                                value={st.text}
                                onChange={(e) => {
                                  const next = [...editStatements]
                                  next[i].text = e.target.value
                                  setEditStatements(next)
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {detail.question_type === 'short_answer' && (
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Đáp án chấp nhận (cách nhau bởi dấu chấm phẩy ;)</label>
                        <input
                          className="w-full border rounded p-2 bg-slate-900 border-slate-700"
                          value={editAcceptedAnswers.join(' ; ')}
                          onChange={(e) => setEditAcceptedAnswers(e.target.value.split(';').map(s => s.trim()))}
                        />
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium">💡 Mẹo (Tip)</label>
                        </div>
                        <textarea
                          className="w-full border rounded p-3 bg-slate-900 border-slate-700 min-h-[80px]"
                          value={editTip}
                          onChange={(e) => setEditTip(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium">📖 Giải thích (Explanation)</label>
                        </div>
                        <textarea
                          className="w-full border rounded p-3 bg-slate-900 border-slate-700 min-h-[80px]"
                          value={editExplanation}
                          onChange={(e) => setEditExplanation(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="flex justify-center">
                      <button
                        className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded font-medium transition-colors"
                        onClick={handleGenTipExp}
                        disabled={genLoading}
                      >
                        {genLoading ? '⌛ Đang gen...' : '✨ Gen lại tip + explanation bằng AI'}
                      </button>
                    </div>
                  </div>

                  {/* Review Processing */}
                  <div className="p-4 rounded border border-blue-900/50 bg-blue-900/10 space-y-4">
                    <h4 className="font-semibold text-blue-400">Hoàn tất xử lí</h4>
                    
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Loại thay đổi <span className="text-red-400">*</span></div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <label className={`flex items-center gap-2 cursor-pointer border rounded p-3 ${reviewType === 'keep' ? 'border-blue-500 bg-blue-900/20' : 'border-slate-700 bg-slate-900/30'}`}>
                          <input
                            type="radio"
                            name="review_type"
                            value="keep"
                            checked={reviewType === 'keep'}
                            onChange={() => setReviewType('keep')}
                          />
                          <span>Không sai (Giữ nguyên)</span>
                        </label>
                        <label className={`flex items-center gap-2 cursor-pointer border rounded p-3 ${reviewType === 'wrong_answer' ? 'border-blue-500 bg-blue-900/20' : 'border-slate-700 bg-slate-900/30'}`}>
                          <input
                            type="radio"
                            name="review_type"
                            value="wrong_answer"
                            checked={reviewType === 'wrong_answer'}
                            onChange={() => setReviewType('wrong_answer')}
                          />
                          <span>Sai đáp án (Sẽ chấm lại bài)</span>
                        </label>
                        <label className={`flex items-center gap-2 cursor-pointer border rounded p-3 ${reviewType === 'wrong_question' ? 'border-blue-500 bg-blue-900/20' : 'border-slate-700 bg-slate-900/30'}`}>
                          <input
                            type="radio"
                            name="review_type"
                            value="wrong_question"
                            checked={reviewType === 'wrong_question'}
                            onChange={() => setReviewType('wrong_question')}
                          />
                          <span>Sai đề (Sẽ cộng full điểm)</span>
                        </label>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-sm font-medium">Ghi chú xử lí (nếu có)</div>
                      <textarea
                        className="w-full border rounded p-2 bg-slate-900 border-slate-700 text-sm"
                        placeholder="Lý do thay đổi, nội dung đã sửa..."
                        value={changeNote}
                        onChange={(e) => setChangeNote(e.target.value)}
                      />
                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        className="bg-green-600 hover:bg-green-700 px-6 py-2 rounded font-bold transition-colors disabled:opacity-50"
                        onClick={handleSaveReview}
                        disabled={saving || !reviewType}
                      >
                        {saving ? '⌛ Đang lưu...' : (reviewType === 'keep' ? 'Đánh dấu đã xem' : 'Lưu và cập nhật điểm')}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="px-4 py-3 border-t border-slate-700 flex items-center justify-between bg-slate-800">
                  <div className="text-sm text-slate-400">
                    Question ID: {detail.question_id}
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="border border-slate-600 rounded px-3 py-1 text-sm hover:bg-slate-700" onClick={goPrevDetail}>
                      ← Câu trước
                    </button>
                    <button className="border border-slate-600 rounded px-3 py-1 text-sm hover:bg-slate-700" onClick={goNextDetail}>
                      Câu tiếp →
                    </button>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
