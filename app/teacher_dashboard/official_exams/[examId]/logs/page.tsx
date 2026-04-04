import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { serviceRoleClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export default async function OfficialExamLogsPage({ params }: { params: { examId: string } }) {
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

  const { data: logs } = await svc
    .from('official_exam_processing_logs')
    .select('id,official_exam_id,status,message,paper_id,sheet_id,attempt_id,created_at')
    .eq('official_exam_id', params.examId)
    .order('created_at', { ascending: false })
    .limit(500)

  return (
    <div className="space-y-4">
      <Link href={`/teacher_dashboard/official_exams/${params.examId}`} prefetch={false} className="underline">← Quay lại</Link>
      <h1 className="text-xl font-semibold">Processing Logs</h1>
      <Card>
        <CardHeader>
          <CardTitle>Logs</CardTitle>
        </CardHeader>
        <CardContent>
          {!logs || logs.length === 0 ? (
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Chưa có log nào</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border rounded" style={{ borderColor: 'var(--divider)' }}>
                <thead>
                  <tr>
                    <th className="text-left p-2">Time</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Message</th>
                    <th className="text-left p-2">paper_id</th>
                    <th className="text-left p-2">sheet_id</th>
                    <th className="text-left p-2">attempt_id</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l: any) => (
                    <tr key={l.id}>
                      <td className="p-2">{l.created_at ? new Date(l.created_at).toLocaleString() : '—'}</td>
                      <td className="p-2">{l.status || '—'}</td>
                      <td className="p-2">{l.message || '—'}</td>
                      <td className="p-2">{l.paper_id ? String(l.paper_id).slice(0, 8) : '—'}</td>
                      <td className="p-2">{l.sheet_id ? String(l.sheet_id).slice(0, 8) : '—'}</td>
                      <td className="p-2">{l.attempt_id ? String(l.attempt_id).slice(0, 8) : '—'}</td>
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

