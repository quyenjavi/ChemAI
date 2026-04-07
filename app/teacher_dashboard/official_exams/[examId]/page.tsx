import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import OfficialExamDetailClient from './OfficialExamDetailClient'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export default async function TeacherOfficialExamDetailPage({ params }: { params: { examId: string } }) {
  const cookieStore = cookies()
  const supabase = createServerComponentClient({ cookies: () => cookieStore } as any)
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user?.id) redirect('/login')
  const { data: t } = await supabase.from('teacher_profiles').select('user_id').eq('user_id', session.user.id).maybeSingle()
  if (!t) redirect('/dashboard')

  return (
    <div className="space-y-6">
      <OfficialExamDetailClient examId={params.examId} />
    </div>
  )
}

