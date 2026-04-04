import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { serviceRoleClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import GradeExamButton from './grade/GradeExamButton'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export default async function OfficialExamDetailPage({ params }: { params: { examId: string } }) {
  const cookieStore = cookies()
  const supabase = createServerComponentClient({ cookies: () => cookieStore } as any)
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user?.id) redirect('/login')

  const { data: t } = await supabase
    .from('teacher_profiles')
    .select('user_id,can_create_exam')
    .eq('user_id', session.user.id)
    .maybeSingle()
  if (!t) redirect('/dashboard')
  if (!t.can_create_exam) redirect('/teacher_dashboard')

  const svc = serviceRoleClient()
  const { data: exam } = await svc
    .from('official_exams')
    .select(`
      id,
      title,
      subject,
      status,
      exam_date,
      semester,
      duration_minutes,
      description,
      total_papers,
      total_students,
      total_sheets,
      total_graded,
      created_at,
      school:schools(id,name),
      grade:grades(id,name),
      academic_year:academic_years(id,name)
    `)
    .eq('id', params.examId)
    .maybeSingle()

  if (!exam) redirect('/teacher_dashboard/official_exams')
  const schoolName = Array.isArray((exam as any).school) ? (exam as any).school?.[0]?.name : (exam as any).school?.name
  const gradeName = Array.isArray((exam as any).grade) ? (exam as any).grade?.[0]?.name : (exam as any).grade?.name
  const academicYearName = Array.isArray((exam as any).academic_year) ? (exam as any).academic_year?.[0]?.name : (exam as any).academic_year?.name

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold truncate">{exam.title}</h1>
          <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {schoolName ? `${schoolName} • ` : ''}{gradeName ? `Khối ${gradeName} • ` : ''}{academicYearName || ''}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs px-2 py-1 rounded border" style={{ borderColor: 'var(--divider)' }}>{exam.status || '—'}</div>
          <GradeExamButton examId={exam.id} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardHeader><CardTitle>Mã đề</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{exam.total_papers ?? 0}</div></CardContent></Card>
        <Card><CardHeader><CardTitle>Học sinh</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{exam.total_students ?? 0}</div></CardContent></Card>
        <Card><CardHeader><CardTitle>Bài làm</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{exam.total_sheets ?? 0}</div></CardContent></Card>
        <Card><CardHeader><CardTitle>Đã chấm</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{exam.total_graded ?? 0}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Thông tin chung</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm" style={{ color: 'var(--text-muted)' }}>
          <div>Môn: {exam.subject || '—'}</div>
          <div>Ngày thi: {exam.exam_date ? new Date(exam.exam_date).toLocaleDateString() : '—'}</div>
          <div>Học kì: {exam.semester || '—'}</div>
          <div>Thời lượng: {exam.duration_minutes ? `${exam.duration_minutes} phút` : '—'}</div>
          {exam.description ? <div>Mô tả: {exam.description}</div> : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Link href={`/teacher_dashboard/official_exams/${exam.id}/papers`} prefetch={false} className="underline">Upload đề thi</Link>
        <Link href={`/teacher_dashboard/official_exams/${exam.id}/mapping`} prefetch={false} className="underline">Đối chiếu mã đề</Link>
        <Link href={`/teacher_dashboard/official_exams/${exam.id}/roster`} prefetch={false} className="underline">Danh sách học sinh</Link>
        <Link href={`/teacher_dashboard/official_exams/${exam.id}/sheet-batches`} prefetch={false} className="underline">Lần upload bài</Link>
        <Link href={`/teacher_dashboard/official_exams/${exam.id}/sheets`} prefetch={false} className="underline">Kiểm tra bài làm</Link>
        <Link href={`/teacher_dashboard/official_exams/${exam.id}/attempts`} prefetch={false} className="underline">Kết quả học sinh</Link>
        <Link href={`/teacher_dashboard/official_exams/${exam.id}/reviews`} prefetch={false} className="underline">Phúc khảo</Link>
        <Link href={`/teacher_dashboard/official_exams/${exam.id}/logs`} prefetch={false} className="underline">Nhật ký hệ thống</Link>
      </div>
    </div>
  )
}
