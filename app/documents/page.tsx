import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { serviceRoleClient } from '@/lib/supabase/server'
import DocumentsGrid from '@/app/documents/DocumentsGrid'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export default async function DocumentsHomePage() {
  const cookieStore = cookies()
  const supabase = createServerComponentClient({ cookies: () => cookieStore } as any)
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user?.id) redirect('/login')

  const svc = serviceRoleClient()

  const { data: profile } = await svc
    .from('student_profiles')
    .select('grade_id')
    .eq('user_id', session.user.id)
    .maybeSingle()
  const preferredGradeId = profile?.grade_id ?? null

  const { data: rows } = await svc
    .from('learning_documents')
    .select('id,title,description,document_type,file_url,thumbnail_url,sort_order,created_at,grade:grades(id,name)')
    .eq('is_visible', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })

  const list = (rows || []).map((r: any) => ({
    grade: Array.isArray(r.grade) ? r.grade[0] : r.grade,
    id: r.id as string,
    title: String(r.title || ''),
    description: r.description != null ? String(r.description) : '',
    document_type: String(r.document_type || ''),
    file_url: String(r.file_url || ''),
    thumbnail_url: r.thumbnail_url != null ? String(r.thumbnail_url) : '',
    sort_order: typeof r.sort_order === 'number' ? r.sort_order : Number(r.sort_order || 0),
    created_at: r.created_at ? String(r.created_at) : '',
    grade_id: (Array.isArray(r.grade) ? r.grade[0]?.id : r.grade?.id) ? String((Array.isArray(r.grade) ? r.grade[0].id : r.grade.id)) : '',
    grade_name: (Array.isArray(r.grade) ? r.grade[0]?.name : r.grade?.name) ? String((Array.isArray(r.grade) ? r.grade[0].name : r.grade.name)) : ''
  }))

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-[28px] sm:text-[32px] font-semibold">TÀI LIỆU</h1>
        <div className="text-sm" style={{color:'var(--text-muted)'}}>Thư viện tài liệu học tập.</div>
      </div>

      <DocumentsGrid documents={list as any} preferredGradeId={preferredGradeId} />
    </div>
  )
}
