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
  const [attempts, setAttempts] = useState<Array<{ 
    id: string, 
    lesson_id: string, 
    lesson_title: string, 
    total: number, 
    correct: number, 
    percent: number, 
    created_at: string,
    report_status?: string,
    reviewed_at?: string,
    review_adjustment_type?: string,
    review_adjustment_note?: string
  }>>([])
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null)
  const [selectedAttemptMeta, setSelectedAttemptMeta] = useState<any | null>(null)
  const [selectedAttemptFeedback, setSelectedAttemptFeedback] = useState<any | null>(null)
  const [attemptDetail, setAttemptDetail] = useState<any[] | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [reportModal, setReportModal] = useState<{qid: string, aid: string, answer_id?: string} | null>(null)
  const [reportReason, setReportReason] = useState('')
  const [reportDetail, setReportDetail] = useState('')
  const [reporting, setReporting] = useState(false)

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
      // load attempts
      const { data: atts } = await supabaseBrowser
        .from('quiz_attempts')
        .select('id, lesson_id, total_questions, correct_answers, score_percent, created_at, score_adjustment_status')
        .eq('user_id', data.user.id)
        .order('created_at', { ascending: false })
        .limit(50)
      
      const list = (atts || [])
      const lessonIds = Array.from(new Set(list.map(a => a.lesson_id).filter(Boolean)))
      let titleById: Record<string, string> = {}
      if (lessonIds.length) {
        const { data: ls } = await supabaseBrowser.from('lessons').select('id,title').in('id', lessonIds)
        titleById = Object.fromEntries((ls || []).map((x: any) => [x.id, x.title || '']))
      }

      // Check for reports for these attempts to show badges
      const { data: reportsData } = await supabaseBrowser
        .from('question_reports')
        .select('attempt_id, status, reviewed_at')
        .in('attempt_id', list.map(a => a.id))

      const reportStatusByAttempt: Record<string, { has_report: boolean, is_reviewed: boolean }> = {}
      for (const r of (reportsData || [])) {
        const prev = reportStatusByAttempt[r.attempt_id] || { has_report: false, is_reviewed: false }
        reportStatusByAttempt[r.attempt_id] = {
          has_report: true,
          is_reviewed: prev.is_reviewed || !!r.reviewed_at || r.status !== 'pending'
        }
      }

      setAttempts(list.map(a => ({
        id: a.id,
        lesson_id: a.lesson_id,
        lesson_title: titleById[a.lesson_id] || 'Bài học',
        total: a.total_questions || 0,
        correct: a.correct_answers || 0,
        percent: a.score_percent || 0,
        created_at: a.created_at,
        report_status: reportStatusByAttempt[a.id]?.has_report ? 'reported' : undefined,
        reviewed_at: reportStatusByAttempt[a.id]?.is_reviewed ? 'reviewed' : undefined,
        review_adjustment_type: (a.score_adjustment_status && a.score_adjustment_status !== 'none') ? a.score_adjustment_status : undefined
      })))
    })
  }, [router])

  const openAttemptDetail = async (id: string) => {
    setSelectedAttemptId(id)
    setDetailLoading(true)
    setAttemptDetail(null)
    setSelectedAttemptMeta(null)
    setSelectedAttemptFeedback(null)
    
    try {
      // Fetch answers and report in parallel
      const [resAnswers, resReport] = await Promise.all([
        fetch(`/api/attempts/${id}/answers`),
        fetch(`/api/attempts/${id}/report`)
      ])
      
      const dataAnswers = await resAnswers.json()
      const dataReport = await resReport.json()
      
      setAttemptDetail(dataAnswers.answers || [])
      setSelectedAttemptMeta(dataReport.attempt || null)
      setSelectedAttemptFeedback({
        feedback: dataReport.feedback,
        short_answer_results: dataReport.short_answer_results
      })
    } catch (err) {
      console.error(err)
    } finally {
      setDetailLoading(false)
    }
  }

  const handleReport = async () => {
    if (!reportModal || !reportReason) return
    setReporting(true)
    try {
      const res = await fetch(`/api/student/attempts/${reportModal.aid}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_id: reportModal.qid,
          attempt_answer_id: reportModal.answer_id,
          report_reason: reportReason,
          report_detail: reportDetail
        })
      })
      const data = await res.json()
      if (data.success) {
        alert('Báo cáo của bạn đã được gửi thành công và đang chờ giáo viên xem xét.')
        setReportModal(null)
        setReportReason('')
        setReportDetail('')
        // Refresh detail to show reported status
        if (selectedAttemptId) openAttemptDetail(selectedAttemptId)
      } else {
        alert(data.error || 'Lỗi khi gửi báo cáo')
      }
    } catch (err: any) {
      alert('Lỗi: ' + err.message)
    } finally {
      setReporting(false)
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
              <div
                key={a.id}
                className="border rounded p-3 cursor-pointer hover:bg-slate-900/10 transition-colors"
                onClick={() => openAttemptDetail(a.id)}
              >
                <div className="flex justify-between items-start">
                  <div className="text-sm font-medium">{a.lesson_title}</div>
                  <div className="flex gap-1">
                    {a.report_status && <span className="text-[10px] bg-red-100 text-red-600 px-1 rounded">Có báo cáo</span>}
                    {a.reviewed_at && <span className="text-[10px] bg-blue-100 text-blue-600 px-1 rounded">Đã xem</span>}
                    {a.review_adjustment_type && <span className="text-[10px] bg-green-100 text-green-600 px-1 rounded">Điểm đã cập nhật</span>}
                  </div>
                </div>
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

      {/* Attempt Detail Modal */}
      {selectedAttemptId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedAttemptId(null)}>
          <div className="bg-slate-950/90 border border-slate-700/60 rounded-lg shadow-xl w-[800px] max-w-[95%] max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 bg-slate-900/60 border-b border-slate-700/60 flex justify-between items-center">
              <h3 className="font-semibold text-slate-100">Chi tiết bài làm</h3>
              <button className="text-slate-200/80 hover:text-slate-100" onClick={() => setSelectedAttemptId(null)}>✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {detailLoading ? (
                <div className="text-center py-10 text-slate-200/70">Đang tải...</div>
              ) : (
                <>
                  {/* Summary Section */}
                  {selectedAttemptMeta && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <div className="rounded-lg border border-slate-700/60 bg-slate-900/30 p-4">
                          <div className="text-xs text-slate-200/70">Tổng câu</div>
                          <div className="mt-1 text-2xl font-semibold text-slate-100">{selectedAttemptMeta.total_questions || selectedAttemptMeta.accuracy_total_units}</div>
                        </div>
                      </div>
                      <div>
                        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4">
                          <div className="text-xs text-slate-200/70">Đúng</div>
                          <div className="mt-1 text-2xl font-semibold text-emerald-100">{selectedAttemptMeta.correct_answers || selectedAttemptMeta.accuracy_correct_units}</div>
                        </div>
                      </div>
                      <div>
                        <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-4">
                          <div className="text-xs text-slate-200/70">Sai</div>
                          <div className="mt-1 text-2xl font-semibold text-rose-100">
                            {(selectedAttemptMeta.total_questions || selectedAttemptMeta.accuracy_total_units) - (selectedAttemptMeta.correct_answers || selectedAttemptMeta.accuracy_correct_units)}
                          </div>
                        </div>
                      </div>
                      <div>
                        <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-4">
                          <div className="text-xs text-slate-200/70">Tỉ lệ đúng</div>
                          <div className="mt-1 text-2xl font-semibold text-blue-100">{selectedAttemptMeta.score_percent || selectedAttemptMeta.accuracy_percent}%</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* AI Feedback Section */}
                  {selectedAttemptFeedback?.feedback && (selectedAttemptFeedback.feedback.praise || selectedAttemptFeedback.feedback.strengths?.length > 0) && (
                    <div className="space-y-4 p-5 rounded-lg border border-blue-500/20 bg-blue-500/10">
                      <h4 className="font-bold text-slate-100 flex items-center gap-2">
                        ✨ Nhận xét từ AI
                      </h4>
                      {selectedAttemptFeedback.feedback.praise && (
                        <p className="text-sm text-slate-100 italic">&ldquo;{selectedAttemptFeedback.feedback.praise}&rdquo;</p>
                      )}
                      {selectedAttemptFeedback.feedback.strengths?.length > 0 && (
                        <div>
                          <div className="text-xs font-bold text-slate-200/80 uppercase mt-2">Điểm mạnh:</div>
                          <ul className="list-disc list-inside text-sm text-slate-100 space-y-1">
                            {selectedAttemptFeedback.feedback.strengths.map((s: string, i: number) => <li key={i}>{s}</li>)}
                          </ul>
                        </div>
                      )}
                      {selectedAttemptFeedback.feedback.plan?.length > 0 && (
                        <div>
                          <div className="text-xs font-bold text-slate-200/80 uppercase mt-2">Kế hoạch học tập:</div>
                          <ul className="list-disc list-inside text-sm text-slate-100 space-y-1">
                            {selectedAttemptFeedback.feedback.plan.map((p: string, i: number) => <li key={i}>{p}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Wrong Answers Detail (Short Answer AI Results) */}
                  {selectedAttemptFeedback?.short_answer_results?.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="font-bold text-rose-100 flex items-center gap-2">
                        ❌ Chi tiết các câu sai
                      </h4>
                      <div className="space-y-3">
                        {selectedAttemptFeedback.short_answer_results.map((res: any, i: number) => (
                          <div key={i} className="p-4 border border-rose-500/20 bg-rose-500/10 rounded text-sm space-y-2 text-slate-100">
                            <div className="flex justify-between font-bold text-slate-100">
                              <span>Câu hỏi {i + 1} (AI nhận xét)</span>
                              {!res.is_correct && <span className="text-xs bg-rose-500/20 border border-rose-500/20 px-2 py-0.5 rounded">Chưa chính xác</span>}
                            </div>
                            <div>
                              <span className="font-bold">Bạn chọn:</span> <span className="text-rose-100">{res.chosen || '—'}</span>
                            </div>
                            <div>
                              <span className="font-bold">Đáp án đúng:</span> <span className="text-emerald-100">{res.correct || '—'}</span>
                            </div>
                            {res.comment && (
                              <div className="italic text-slate-100/90 mt-1">&ldquo;{res.comment}&rdquo;</div>
                            )}
                            {res.explain && (
                              <div className="bg-slate-950/30 p-3 rounded mt-1 text-xs border border-slate-700/60">
                                <span className="font-bold">Giải thích:</span> {res.explain}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Detailed Answers List */}
                  <div className="space-y-4 pt-4 border-t border-slate-700/60">
                    <h4 className="font-bold text-slate-100">📋 Danh sách câu hỏi chi tiết</h4>
                    {attemptDetail?.map((item, idx) => {
                      const isWrong = item.is_correct === false || (Number(item.score_awarded ?? 0) < Number(item.max_score ?? 1))
                      const canReport = 
                        item.report_locked !== true && 
                        !item.report_id && 
                        !item.review_adjustment_type && 
                        isWrong
                      
                      const hasReported = !!item.report_id || !!item.report_status
                      const isReviewedKeep = item.review_status === 'reviewed_keep'
                      const isAdjusted = !!item.review_adjustment_type

                      return (
                        <div key={idx} className="border border-slate-700/60 rounded p-5 space-y-2 relative bg-slate-900/30 text-slate-100">
                          <div className="flex justify-between items-start">
                            <div className="text-sm font-bold text-slate-100">Câu {idx + 1}</div>
                            {canReport && (
                              <button 
                                className="text-xs bg-rose-500/10 text-rose-100 hover:bg-rose-500/15 px-2 py-1 rounded border border-rose-500/20 transition-colors flex items-center gap-1"
                                onClick={() => setReportModal({ 
                                  qid: item.question_id, 
                                  aid: selectedAttemptId!, 
                                  answer_id: item.answer_id 
                                })}
                              >
                                🚩 Báo cáo sai sót
                              </button>
                            )}
                          </div>
                          <div className="text-sm whitespace-pre-wrap text-slate-100">{item.content}</div>
                          
                          {/* Render Statements for True/False */}
                          {item.statements && item.statements.length > 0 && (
                            <div className="mt-2 space-y-1 border-l-2 border-slate-700 pl-3">
                              {item.statements.map((st: any, i: number) => (
                                <div key={i} className="text-xs flex items-center gap-2">
                                  <span className="font-bold w-4">{st.statement_key || String.fromCharCode(97 + i)}.</span>
                                  <span className="flex-1 text-slate-100">{st.text}</span>
                                  <span className={st.is_correct ? 'text-emerald-200' : 'text-rose-200'}>
                                    Bạn chọn: {st.selected_answer === true ? 'Đúng' : st.selected_answer === false ? 'Sai' : '—'}
                                    {st.is_correct ? ' (Đúng)' : ' (Sai)'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="text-xs space-y-1 mt-2">
                            {(!item.statements || item.statements.length === 0) && (
                              <div className="font-medium">Đáp án của bạn: 
                                <span className={item.is_correct ? 'text-emerald-200 ml-1' : 'text-rose-200 ml-1'}>
                                  {item.question_type === 'short_answer' ? (item.answer_text || '—') : (item.selected_answer || '—')}
                                  {item.is_correct ? ' (Đúng)' : ' (Sai)'}
                                </span>
                              </div>
                            )}

                            {hasReported && !isReviewedKeep && !isAdjusted && (
                              <div className="flex items-center gap-1 text-amber-200 font-medium">
                                <span className="text-[10px] bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">Đã gửi báo cáo - đang chờ giáo viên xem</span>
                              </div>
                            )}

                            {isReviewedKeep && (
                              <div className="flex items-center gap-1 text-slate-200/80 font-medium">
                                <span className="text-[10px] bg-slate-900/40 border border-slate-700/60 px-1.5 py-0.5 rounded">Giáo viên đã xem và giữ nguyên đáp án</span>
                              </div>
                            )}

                            {item.review_adjustment_type === 'wrong_answer_regrade' && (
                              <div className="text-emerald-100 font-medium bg-emerald-500/10 p-3 rounded mt-2 border border-emerald-500/20">
                                <span className="font-bold">✨ Giáo viên đã sửa đáp án:</span> Điểm của bạn đã được cập nhật.
                                {item.review_adjustment_note && <div className="mt-1 text-slate-100/80 font-normal">&ldquo;{item.review_adjustment_note}&rdquo;</div>}
                              </div>
                            )}

                            {item.review_adjustment_type === 'wrong_question_full_credit' && (
                              <div className="text-blue-100 font-medium bg-blue-500/10 p-3 rounded mt-2 border border-blue-500/20">
                                <span className="font-bold">✨ Câu hỏi có lỗi:</span> Bạn đã được cộng tối đa điểm câu này.
                                {item.review_adjustment_note && <div className="mt-1 text-slate-100/80 font-normal">&ldquo;{item.review_adjustment_note}&rdquo;</div>}
                              </div>
                            )}
                          </div>

                          {(item.tip || item.explanation) && (
                            <div className="mt-2 p-3 bg-slate-950/20 border border-slate-700/60 rounded text-xs space-y-1 text-slate-100">
                              {item.tip && <div><span className="font-bold">Mẹo:</span> {item.tip}</div>}
                              {item.explanation && <div><span className="font-bold">Giải thích:</span> {item.explanation}</div>}
                            </div>
                          )}
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

      {/* Report Modal */}
      {reportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]" onClick={() => setReportModal(null)}>
          <div className="bg-white rounded shadow-xl w-[400px] max-w-[90%] p-4 space-y-4" onClick={e => e.stopPropagation()}>
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
                  value={reportDetail}
                  onChange={e => setReportDetail(e.target.value)}
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
      )}
    </div>
  )
}
