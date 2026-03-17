import Link from 'next/link'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { serviceRoleClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

function gradeNumberFromName(name: string) {
  const m = String(name || '').match(/\d+/)
  const n = m ? Number(m[0]) : NaN
  return Number.isFinite(n) ? n : null
}

export default async function DocumentViewPage({ params }: { params: { docId: string } }) {
  const cookieStore = cookies()
  const supabase = createServerComponentClient({ cookies: () => cookieStore } as any)
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user?.id) redirect('/login')

  const docId = String(params.docId || '').trim()
  if (!docId) notFound()

  const svc = serviceRoleClient()
  const { data: row } = await svc
    .from('learning_documents')
    .select('id,title,description,document_type,file_url,thumbnail_url,grade:grades(id,name)')
    .eq('id', docId)
    .eq('is_visible', true)
    .maybeSingle()

  if (!row) notFound()

  const gradeObj: any = Array.isArray((row as any).grade) ? (row as any).grade[0] : (row as any).grade
  const gradeName = gradeObj?.name ? String(gradeObj.name) : ''
  const gradeNum = gradeNumberFromName(gradeName)
  const gradeTag = gradeNum ? String(gradeNum) : (gradeName || '—')
  const docType = String(row.document_type || 'tai-lieu')

  return (
    <div className="space-y-5">
      <div className="text-sm" style={{color:'var(--text-muted)'}}>
        <Link href="/documents" className="underline" prefetch={false}>TÀI LIỆU</Link>
        <span> {'>'} </span>
        <span>[{gradeTag}]</span>
        <span> </span>
        <span>[{docType}]</span>
        <span> {'>'} </span>
        <span>{row.title}</span>
      </div>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1 min-w-0">
          <h1 className="text-[22px] sm:text-[26px] font-semibold truncate">{row.title}</h1>
          {row.description ? (
            <div className="text-sm whitespace-pre-line" style={{color:'var(--text-muted)'}}>{row.description}</div>
          ) : null}
        </div>
        <Link href="/documents" prefetch={false} className="text-sm underline" style={{color:'var(--gold)'}}>
          Quay lại danh sách
        </Link>
      </div>

      <Card className="border" style={{borderColor:'var(--divider)'}}>
        <CardHeader>
          <CardTitle className="text-base">Xem tài liệu</CardTitle>
        </CardHeader>
        <CardContent>
          <iframe
            src={String(row.file_url || '')}
            title={String(row.title || '')}
            style={{ width: '100%', height: '80vh', border: 'none' }}
            allowFullScreen
          />
        </CardContent>
      </Card>
    </div>
  )
}
