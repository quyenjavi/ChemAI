import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import LessonManageClient from './LessonManageClient'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export default async function TeacherLessonManagePage({ params }: { params: { lessonId: string } }) {
  const cookieStore = cookies()
  const supabase = createServerComponentClient({ cookies: () => cookieStore } as any)
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user?.id) redirect('/login')

  const { data: t } = await supabase.from('teacher_profiles').select('user_id').eq('user_id', session.user.id).maybeSingle()
  if (!t) redirect('/teacher_dashboard')

  return (
    <div className="space-y-4">
      <Link href="/teacher_dashboard/analytics" prefetch={false} className="underline">← Quay lại</Link>
      <LessonManageClient lessonId={params.lessonId} />
    </div>
  )
}

