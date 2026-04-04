import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import ClassesClient from './classes/ClassesClient'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { serviceRoleClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export default async function TeacherDashboard() {
  const cookieStore = cookies()
  const supabase = createServerComponentClient({ cookies: () => cookieStore } as any)
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user?.id) {
    redirect('/login')
  }
  const uid = session.user.id
  const { data: t } = await supabase.from('teacher_profiles').select('id,full_name,school_id,can_create_exam').eq('user_id', uid).maybeSingle()
  if (!t) {
    redirect('/dashboard')
  }
  const svc = serviceRoleClient()
  const schoolId = t.school_id
  const { count: totalStudentsCount } = await svc
    .from('student_profiles')
    .select('user_id', { count: 'exact', head: true })
    .eq('school_id', schoolId)
  const { data: sUsers } = await svc.from('student_profiles').select('user_id').eq('school_id', schoolId)
  const userIds = Array.from(new Set((sUsers || []).map((x: any) => x.user_id).filter(Boolean)))
  const { count: totalAttemptsCount } = userIds.length ? await svc
    .from('quiz_attempts')
    .select('id', { count: 'exact', head: true })
    .in('user_id', userIds) : { count: 0 }
  const sinceISO = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { count: attempts24hCount } = userIds.length ? await svc
    .from('quiz_attempts')
    .select('id', { count: 'exact', head: true })
    .in('user_id', userIds)
    .gte('created_at', sinceISO) : { count: 0 }
  const { count: newStudents24hCount, error: newStuErr } = await svc
    .from('student_profiles')
    .select('user_id', { count: 'exact', head: true })
    .eq('school_id', schoolId)
    .gte('created_at', sinceISO)
  const showNewStudents24h = !newStuErr

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Teacher Dashboard</h1>
        <div className="flex items-center gap-2">
          <Link href="/teacher_dashboard/questions" prefetch={false} className="underline">Quản lí câu hỏi</Link>
          <Link href="/teacher_dashboard/analytics" prefetch={false} className="underline">Quản lí bài học</Link>
          {t.can_create_exam ? <Link href="/teacher_dashboard/exams/create" prefetch={false} className="underline">Tạo đề</Link> : null}
          {t.can_create_exam ? <Link href="/teacher_dashboard/exams/review" prefetch={false} className="underline">Xử lí đề mới tạo</Link> : null}
          {t.can_create_exam ? <Link href="/teacher_dashboard/matrix_exams/create" prefetch={false} className="underline">Tạo đề theo ma trận</Link> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardHeader><CardTitle>Tổng số học sinh</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{totalStudentsCount ?? 0}</div></CardContent></Card>
        <Card><CardHeader><CardTitle>Tổng lượt làm bài</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{totalAttemptsCount ?? 0}</div></CardContent></Card>
        <Card><CardHeader><CardTitle>Lượt làm bài 24h qua</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{attempts24hCount ?? 0}</div></CardContent></Card>
        <Card><CardHeader><CardTitle>Học sinh mới 24h qua</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{showNewStudents24h ? (newStudents24hCount ?? 0) : '—'}</div></CardContent></Card>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Lớp phụ trách</h2>
          <Link href="/teacher_dashboard/classes" prefetch={false} className="underline">Xem toàn màn hình</Link>
        </div>
        <div>
          <label className="text-sm">Chọn lớp</label>
          <ClassesClient />
        </div>
      </div>
    </div>
  )
}
