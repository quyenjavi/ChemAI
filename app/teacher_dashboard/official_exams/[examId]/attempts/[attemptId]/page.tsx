import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { serviceRoleClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import AttemptAdjustClient from './AttemptAdjustClient'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

function one(x: any) {
  if (!x) return null
  return Array.isArray(x) ? (x[0] || null) : x
}

export default async function OfficialExamAttemptDetailPage({ params }: { params: { examId: string, attemptId: string } }) {
  const cookieStore = cookies()
  const supabase = createServerComponentClient({ cookies: () => cookieStore } as any)
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user?.id) redirect('/login')
  const { data: t } = await supabase.from('teacher_profiles').select('user_id,can_create_exam').eq('user_id', session.user.id).maybeSingle()
  if (!t) redirect('/dashboard')
  if (!t.can_create_exam) redirect('/teacher_dashboard')

  const svc = serviceRoleClient()
  const { data: teacher } = await svc.from('teacher_profiles').select('user_id,school_id').eq('user_id', session.user.id).maybeSingle()
  const { data: exam } = await svc.from('official_exams').select('id,school_id,title').eq('id', params.examId).maybeSingle()
  if (!teacher || !exam || exam.school_id !== teacher.school_id) redirect('/teacher_dashboard/official_exams')

  const { data: attempt } = await svc
    .from('official_exam_attempts')
    .select(`
      id,
      official_exam_id,
      student_id,
      paper_id,
      sheet_id,
      status,
      total_score,
      correct_count,
      incorrect_count,
      blank_count,
      created_at,
      student:official_exam_students(id,student_code,full_name,class_name,seat_no),
      paper:official_exam_papers(id,paper_code)
    `)
    .eq('id', params.attemptId)
    .eq('official_exam_id', params.examId)
    .maybeSingle()

  if (!attempt) redirect(`/teacher_dashboard/official_exams/${params.examId}/attempts`)

  const { data: answers } = await svc
    .from('official_exam_attempt_answers')
    .select('id,attempt_id,paper_question_no,master_question_id,selected_answer,correct_answer,is_correct,score_awarded,answer_source,review_status,created_at')
    .eq('attempt_id', params.attemptId)
    .order('paper_question_no', { ascending: true })
    .limit(5000)

  const stu = one((attempt as any).student)
  const pap = one((attempt as any).paper)

  return (
    <div className="space-y-4">
      <Link href={`/teacher_dashboard/official_exams/${params.examId}/attempts`} prefetch={false} className="underline">← Quay lại</Link>
      <h1 className="text-xl font-semibold">Attempt Detail</h1>

      <Card>
        <CardHeader>
          <CardTitle>Thông tin</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm" style={{ color: 'var(--text-muted)' }}>
          <div>SBD: {stu?.student_code || '—'} • {stu?.full_name || '—'}</div>
          <div>Mã đề: {pap?.paper_code || '—'}</div>
          <div>Điểm: {attempt.total_score ?? 0} • Đúng: {attempt.correct_count ?? 0} • Sai: {attempt.incorrect_count ?? 0} • Trống: {attempt.blank_count ?? 0}</div>
          <div>Status: {attempt.status || '—'}</div>
        </CardContent>
      </Card>

      <AttemptAdjustClient examId={params.examId} attemptId={params.attemptId} />

      <Card>
        <CardHeader>
          <CardTitle>Chi tiết từng câu</CardTitle>
        </CardHeader>
        <CardContent>
          {!answers || answers.length === 0 ? (
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Chưa có câu trả lời</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border rounded" style={{ borderColor: 'var(--divider)' }}>
                <thead>
                  <tr>
                    <th className="text-left p-2">Câu</th>
                    <th className="text-left p-2">Chọn</th>
                    <th className="text-left p-2">Đúng</th>
                    <th className="text-left p-2">KQ</th>
                    <th className="text-left p-2">Điểm</th>
                    <th className="text-left p-2">Nguồn</th>
                    <th className="text-left p-2">Review</th>
                  </tr>
                </thead>
                <tbody>
                  {answers.map((a: any) => (
                    <tr key={a.id}>
                      <td className="p-2">{a.paper_question_no}</td>
                      <td className="p-2">{a.selected_answer || '—'}</td>
                      <td className="p-2">{a.correct_answer || '—'}</td>
                      <td className="p-2">{a.is_correct === true ? '✅' : a.is_correct === false ? '❌' : '—'}</td>
                      <td className="p-2">{a.score_awarded ?? 0}</td>
                      <td className="p-2">{a.answer_source || '—'}</td>
                      <td className="p-2">{a.review_status || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

