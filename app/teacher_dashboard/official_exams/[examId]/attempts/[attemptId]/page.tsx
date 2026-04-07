import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import AttemptDetailClient from './AttemptDetailClient'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export default async function TeacherOfficialExamAttemptPage({ params }: { params: { examId: string, attemptId: string } }) {
  const cookieStore = cookies()
  const supabase = createServerComponentClient({ cookies: () => cookieStore } as any)
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user?.id) redirect('/login')
  const { data: t } = await supabase.from('teacher_profiles').select('user_id').eq('user_id', session.user.id).maybeSingle()
  if (!t) redirect('/dashboard')

  return (
    <AttemptDetailClient examId={params.examId} attemptId={params.attemptId} />
  )
}

