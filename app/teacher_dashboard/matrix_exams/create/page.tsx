import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import MatrixCreateClient from './MatrixCreateClient'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export default async function MatrixExamCreatePage() {
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

  return <MatrixCreateClient />
}

