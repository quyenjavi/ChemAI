'use client'
import { useEffect, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    supabaseBrowser.auth.getUser().then(({ data }) => {
      if (data.user) {
        router.replace('/')
      }
    })
  }, [router])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { data, error } = await supabaseBrowser.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      if (error.message?.toLowerCase().includes('confirm') || error.message?.toLowerCase().includes('not confirmed')) {
        setError('Email chưa xác nhận. Vui lòng kiểm tra hộp thư và xác thực.')
      } else {
        setError(error.message)
      }
      return
    }
    await fetch('/api/profile/migrate', { method: 'POST' }).catch(()=>{})
    router.push('/dashboard')
  }

  return (
    <Card className="max-w-sm mx-auto">
      <CardContent>
        <div className="text-center mb-4">
          <div className="text-lg font-semibold" style={{color:'var(--gold)'}}>Mỗi học sinh một Uyển Sensei hỗ trợ!</div>
          <div className="text-sm" style={{color:'var(--text-muted)'}}>Luyện Hóa THPT với Quizz, AI Chatbot</div>
        </div>
        <form className="space-y-3" onSubmit={onSubmit}>
          <Input placeholder="Email" type="email" value={email} onChange={e=>setEmail(e.target.value)} />
          <Input placeholder="Mật khẩu" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
          {error ? <div className="text-red-600 text-sm">{error}</div> : null}
          <Button disabled={loading} className="w-full">
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </Button>
        </form>
        <div className="text-sm mt-3 opacity-80">Đăng ký nếu chưa có tài khoản? <a href="/signup" className="underline">Đăng ký</a></div>
      </CardContent>
    </Card>
  )
}
