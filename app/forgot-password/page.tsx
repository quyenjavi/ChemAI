'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSent(false)
    const redirectTo = `${window.location.origin}/reset-password`
    const { error } = await supabaseBrowser.auth.resetPasswordForEmail(email.trim(), { redirectTo })
    setLoading(false)
    if (error) {
      setError(error.message || 'Không thể gửi email. Vui lòng thử lại.')
      return
    }
    setSent(true)
  }

  return (
    <div className="min-h-[70vh]">
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 items-center px-4">
        <div className="py-10">
          <h1 className="text-[32px] md:text-[38px] font-semibold leading-tight">Lấy lại mật khẩu</h1>
          <p className="mt-2 text-[15px]" style={{color:'var(--text-secondary)'}}>
            Nhập email đã đăng ký, hệ thống sẽ gửi link để đặt lại mật khẩu.
          </p>
        </div>
        <Card className="max-w-md w-full mx-auto md:ml-auto">
          <CardContent>
            <div className="text-center mb-4">
              <div className="text-[20px] font-semibold" style={{color:'var(--text)'}}>Gửi link đặt lại</div>
              <div className="text-[14px]" style={{color:'var(--text-muted)'}}>Kiểm tra cả Spam/Quảng cáo nếu không thấy.</div>
            </div>
            <form className="space-y-4" onSubmit={onSubmit}>
              <Input placeholder="Email" type="email" value={email} onChange={e=>setEmail(e.target.value)} />
              {sent ? (
                <div className="text-green-400 text-sm">Đã gửi email. Vui lòng kiểm tra hộp thư.</div>
              ) : null}
              {error ? <div className="text-red-500 text-sm">{error}</div> : null}
              <Button disabled={loading || !email.trim()} className="w-full gradient-btn">
                {loading ? 'Đang gửi...' : 'Gửi email'}
              </Button>
              <button
                type="button"
                className="w-full text-sm underline"
                style={{color:'var(--gold)'}}
                onClick={() => router.push('/login')}
              >
                Quay lại đăng nhập
              </button>
            </form>
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
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
