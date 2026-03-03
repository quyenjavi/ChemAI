import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default function Home() {
  return (
    <Card>
      <CardContent className="py-6">
        <div className="text-center space-y-2">
          <div className="text-2xl font-semibold" style={{color:'var(--gold)'}}>ChemAI Uyển Sensei</div>
          <div style={{color:'var(--text-muted)'}}>Luyện Hóa THPT với Quizz, AI Chatbot</div>
          <div className="flex items-center justify-center gap-2 pt-2">
            <Link href="/dashboard"><Button>Bắt đầu học</Button></Link>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
