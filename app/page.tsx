import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cookies } from 'next/headers'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const cookieStore = cookies()
  const supabase = createServerComponentClient({ cookies: () => cookieStore } as any)
  const { data: { session } } = await supabase.auth.getSession()
  if (session) {
    redirect('/dashboard')
  }
  return (
    <Card>
      <CardContent className="py-6">
        <div className="text-center space-y-2">
          <div className="text-2xl font-semibold" style={{color:'var(--gold)'}}>ChemAI LUYỆN HÓA THPT</div>
          <div style={{color:'var(--text-muted)'}}>Nền tảng luyện Hóa thông minh cho học sinh THPT</div>
          <div className="flex items-center justify-center gap-2 pt-2">
            <Link href="/login"><Button>Bắt đầu học</Button></Link>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
