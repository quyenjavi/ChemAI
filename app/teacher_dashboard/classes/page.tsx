import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import ClassesClient from './ClassesClient'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export default async function TeacherClassesPage() {
  const cookieStore = cookies()
  const supabase = createServerComponentClient({ cookies: () => cookieStore } as any)
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user?.id) redirect('/login')
  const { data: t } = await supabase.from('teacher_profiles').select('user_id').eq('user_id', session.user.id).maybeSingle()
  if (!t) redirect('/dashboard')
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Lớp phụ trách</h1>
        <Link href="/teacher_dashboard" className="underline">Quay lại tổng quan</Link>
      </div>
      <div className="space-y-4">
        <div>
          <label className="text-sm">Chọn lớp</label>
          <ClassesClient />
        </div>
      </div>
    </div>
  )
}

 
