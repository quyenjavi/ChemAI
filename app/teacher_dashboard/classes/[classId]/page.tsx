import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { serviceRoleClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export default async function ClassDetailPage({ params }: { params: { classId: string } }) {
  const classId = params.classId
  const cookieStore = cookies()
  const supabase = createServerComponentClient({ cookies: () => cookieStore } as any)
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user?.id) redirect('/login')
  const uid = session.user.id
  const { data: t } = await supabase.from('teacher_profiles').select('user_id').eq('user_id', uid).maybeSingle()
  if (!t) redirect('/dashboard')
  const svc = serviceRoleClient()
  const { data: assigned } = await svc.from('teacher_class_assignments').select('class_id').eq('teacher_user_id', uid).eq('class_id', classId).maybeSingle()
  if (!assigned) {
    redirect('/teacher_dashboard/classes')
  }
  const { data: cls } = await svc.from('classes').select('id,name,grade_id').eq('id', classId).maybeSingle()
  const { data: students } = await svc.from('student_profiles').select('user_id,full_name').eq('class_id', classId)
  const studentIds = Array.from(new Set((students || []).map((s: any) => s.user_id)))
  const { data: attempts } = studentIds.length ? await svc.from('quiz_attempts').select('id,user_id,lesson_id,score_percent,created_at').in('user_id', studentIds).order('created_at', { ascending: false }).limit(1000) : { data: [] }
  const byStudent: Record<string, { count: number, avg: number, last: string | null }> = {}
  for (const s of (students || []) as any[]) {
    const arr = (attempts || []).filter((a: any) => a.user_id === s.user_id)
    const count = arr.length
    const avg = count ? Math.round((arr.reduce((sum: number, a: any) => sum + (a.score_percent || 0), 0) / count) * 10) / 10 : 0
    const last = arr[0]?.created_at || null
    byStudent[s.user_id] = { count, avg, last }
  }
  const lessonCount: Record<string, number> = {}
  for (const a of (attempts || []) as any[]) {
    const lid = a.lesson_id
    if (lid) lessonCount[lid] = (lessonCount[lid] || 0) + 1
  }
  const topLessonId = Object.entries(lessonCount).sort((x, y) => y[1] - x[1])[0]?.[0] || null
  const { data: topLesson } = topLessonId ? await svc.from('lessons').select('id,title').eq('id', topLessonId).maybeSingle() : { data: null }
  const attemptIds = Array.from(new Set((attempts || []).map((a: any) => a.id)))
  const { data: answers } = attemptIds.length ? await svc.from('quiz_attempt_answers').select('question_id,is_correct,attempt_id').in('attempt_id', attemptIds) : { data: [] }
  const wrongCount: Record<string, number> = {}
  for (const r of (answers || []) as any[]) {
    if (r.is_correct === false && r.question_id) wrongCount[r.question_id] = (wrongCount[r.question_id] || 0) + 1
  }
  const topWrongQId = Object.entries(wrongCount).sort((x, y) => y[1] - x[1])[0]?.[0] || null
  const { data: topWrongQ } = topWrongQId ? await svc.from('questions').select('id,content,topic').eq('id', topWrongQId).maybeSingle() : { data: null }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Lớp {cls?.name || classId}</h1>
        <Link href="/teacher_dashboard/classes" className="underline">Quay lại danh sách lớp</Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardHeader><CardTitle>Khối</CardTitle></CardHeader><CardContent><div className="text-xl font-bold">{cls?.grade_id || '—'}</div></CardContent></Card>
        <Card><CardHeader><CardTitle>Tổng số học sinh</CardTitle></CardHeader><CardContent><div className="text-xl font-bold">{(students || []).length}</div></CardContent></Card>
        <Card><CardHeader><CardTitle>Bài được làm nhiều nhất</CardTitle></CardHeader><CardContent><div className="text-sm">{topLesson?.title || '—'}</div></CardContent></Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Danh sách học sinh</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {(students || []).map((s: any) => {
              const st = byStudent[s.user_id] || { count: 0, avg: 0, last: null }
              return (
                <div key={s.user_id} className="border rounded p-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{s.full_name || s.user_id}</div>
                    <div className="text-xs" style={{color:'var(--text-muted)'}}>Bài đã làm: {st.count} • Điểm TB: {st.avg}% • Gần nhất: {st.last ? new Date(st.last).toLocaleString() : '—'}</div>
                  </div>
                </div>
              )
            })}
            {(students || []).length === 0 ? <div className="text-sm" style={{color:'var(--text-muted)'}}>Chưa có học sinh</div> : null}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Phân tích nhanh</CardTitle></CardHeader>
        <CardContent>
          <div className="text-sm">
            <div>Câu hỏi sai nhiều nhất: <span className="font-medium">{topWrongQ?.content || '—'}</span> {topWrongQ?.topic ? `(Chủ đề: ${topWrongQ.topic})` : ''}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
