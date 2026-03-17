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
    const session = data.session
    if (session?.access_token && session?.refresh_token) {
      const r = await fetch('/api/auth/cookie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token
        })
      }).catch(()=>null)
      if (!r || !r.ok) {
        setError('Không thể thiết lập phiên đăng nhập. Vui lòng thử lại.')
        return
      }
    }
    fetch('/api/profile/migrate', { method: 'POST' }).catch(()=>{})
    router.replace('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-[70vh] relative overflow-hidden">
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 items-center px-4">
        <div className="py-10">
          <h1 className="text-[36px] md:text-[42px] font-semibold leading-tight">
            ChemAI LAB
          </h1>
          <p className="mt-2 text-[15px]" style={{color:'var(--text-secondary)'}}>
            Không ai trượt vì sai một câu khó – họ trượt vì sai nhiều câu nhỏ ...
          </p>
        </div>
        <Card className="max-w-md w-full mx-auto md:ml-auto">
          <CardContent>
            <div className="text-center mb-4">
            <div className="text-[22px] font-semibold" style={{color:'var(--text)'}}>Vào lớp thôi!</div>
            <div className="text-[14px]" style={{color:'var(--text-muted)'}}>Học mọi lúc, mọi nơi!</div>
            </div>
            <form className="space-y-4" onSubmit={onSubmit}>
              <Input placeholder="Email" type="email" value={email} onChange={e=>setEmail(e.target.value)} />
              <Input placeholder="Mật khẩu" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
              {error ? <div className="text-red-500 text-sm">{error}</div> : null}
              <Button disabled={loading} className="w-full gradient-btn">
                {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
              </Button>
              <a href="/forgot-password" className="block text-sm underline text-center" style={{color:'var(--gold)'}}>
                Quên mật khẩu?
              </a>
            </form>
            <div className="text-sm mt-4" style={{color:'var(--text-muted)'}}>Chưa có tài khoản? <a href="/signup" className="underline">Đăng ký</a></div>
          </CardContent>
        </Card>
      </div>
      <style jsx>{`
        .gradient-btn{
          background: linear-gradient(90deg, #2563EB 0%, #6D28D9 50%, #9333EA 100%);
          box-shadow: 0 8px 24px rgba(109,40,217,0.35);
        }
        .gradient-btn:hover{
          filter: brightness(1.03);
          box-shadow: 0 10px 28px rgba(109,40,217,0.45);
        }
      `}</style>
    </div>
  )
}

 
