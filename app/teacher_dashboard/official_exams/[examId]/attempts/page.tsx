import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { serviceRoleClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

function one(x: any) {
  if (!x) return null
  return Array.isArray(x) ? (x[0] || null) : x
}

export default async function OfficialExamAttemptsPage({ params }: { params: { examId: string } }) {
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

  const { data: attempts } = await svc
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
      student:official_exam_students(id,student_code,full_name),
      paper:official_exam_papers(id,paper_code)
    `)
    .eq('official_exam_id', params.examId)
    .order('total_score', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(500)

  return (
    <div className="space-y-4">
      <Link href={`/teacher_dashboard/official_exams/${params.examId}`} prefetch={false} className="underline">← Quay lại</Link>
      <h1 className="text-xl font-semibold">Attempts</h1>
      <Card>
        <CardHeader>
          <CardTitle>Danh sách kết quả</CardTitle>
        </CardHeader>
        <CardContent>
          {!attempts || attempts.length === 0 ? (
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Chưa có attempt nào</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border rounded" style={{ borderColor: 'var(--divider)' }}>
                <thead>
                  <tr>
                    <th className="text-left p-2">SBD</th>
                    <th className="text-left p-2">Họ tên</th>
                    <th className="text-left p-2">Mã đề</th>
                    <th className="text-left p-2">Điểm</th>
                    <th className="text-left p-2">Đúng</th>
                    <th className="text-left p-2">Sai</th>
                    <th className="text-left p-2">Bỏ trống</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Chi tiết</th>
                  </tr>
                </thead>
                <tbody>
                  {attempts.map((a: any) => {
                    const stu = one(a.student)
                    const pap = one(a.paper)
                    return (
                      <tr key={a.id}>
                        <td className="p-2">{stu?.student_code || '—'}</td>
                        <td className="p-2">{stu?.full_name || '—'}</td>
                        <td className="p-2">{pap?.paper_code || '—'}</td>
                        <td className="p-2">{a.total_score ?? 0}</td>
                        <td className="p-2">{a.correct_count ?? 0}</td>
                        <td className="p-2">{a.incorrect_count ?? 0}</td>
                        <td className="p-2">{a.blank_count ?? 0}</td>
                        <td className="p-2">{a.status || '—'}</td>
                        <td className="p-2">
                          <Link href={`/teacher_dashboard/official_exams/${params.examId}/attempts/${a.id}`} prefetch={false} className="underline">Mở</Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

