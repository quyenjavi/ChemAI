import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { serviceRoleClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export default async function OfficialExamReviewsPage({ params }: { params: { examId: string } }) {
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

  const { data: reviews } = await svc
    .from('official_exam_reviews')
    .select('id,official_exam_id,attempt_id,attempt_answer_id,status,note,created_at')
    .eq('official_exam_id', params.examId)
    .order('created_at', { ascending: false })
    .limit(500)

  return (
    <div className="space-y-4">
      <Link href={`/teacher_dashboard/official_exams/${params.examId}`} prefetch={false} className="underline">← Quay lại</Link>
      <h1 className="text-xl font-semibold">Reviews</h1>
      <Card>
        <CardHeader>
          <CardTitle>Danh sách phúc khảo</CardTitle>
        </CardHeader>
        <CardContent>
          {!reviews || reviews.length === 0 ? (
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Chưa có review nào</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border rounded" style={{ borderColor: 'var(--divider)' }}>
                <thead>
                  <tr>
                    <th className="text-left p-2">Time</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Attempt</th>
                    <th className="text-left p-2">Attempt answer</th>
                    <th className="text-left p-2">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {reviews.map((r: any) => (
                    <tr key={r.id}>
                      <td className="p-2">{r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</td>
                      <td className="p-2">{r.status || '—'}</td>
                      <td className="p-2">
                        <Link href={`/teacher_dashboard/official_exams/${params.examId}/attempts/${r.attempt_id}`} prefetch={false} className="underline">
                          {String(r.attempt_id || '').slice(0, 8)}
                        </Link>
                      </td>
                      <td className="p-2">{String(r.attempt_answer_id || '').slice(0, 8)}</td>
                      <td className="p-2">{r.note || '—'}</td>
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

