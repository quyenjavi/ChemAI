import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import SheetBatchesClient from './SheetBatchesClient'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export default async function OfficialExamSheetBatchesPage({ params }: { params: { examId: string } }) {
  const cookieStore = cookies()
  const supabase = createServerComponentClient({ cookies: () => cookieStore } as any)
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user?.id) redirect('/login')
  const { data: t } = await supabase.from('teacher_profiles').select('user_id,can_create_exam').eq('user_id', session.user.id).maybeSingle()
  if (!t) redirect('/dashboard')
  if (!t.can_create_exam) redirect('/teacher_dashboard')
  return (
    <div className="space-y-4">
      <Link href={`/teacher_dashboard/official_exams/${params.examId}`} prefetch={false} className="underline">← Quay lại</Link>
      <SheetBatchesClient examId={params.examId} />
    </div>
  )
}

