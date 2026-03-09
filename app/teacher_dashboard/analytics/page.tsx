import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { serviceRoleClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import LessonStatsClient from './LessonStatsClient'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export default async function TeacherAnalyticsPage() {
  const cookieStore = cookies()
  const supabase = createServerComponentClient({ cookies: () => cookieStore } as any)
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user?.id) redirect('/login')
  const uid = session.user.id
  const { data: t } = await supabase.from('teacher_profiles').select('user_id').eq('user_id', uid).maybeSingle()
  if (!t) redirect('/dashboard')
  const svc = serviceRoleClient()
  // Phần analytics chi tiết (bài nhiều nhất, chủ đề thấp, câu sai) được bỏ theo yêu cầu

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Phân tích lớp học</h1>
      
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle>Danh sách bài học (trong phạm vi trường)</CardTitle></CardHeader>
          <CardContent>
            <LessonStatsClient />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
