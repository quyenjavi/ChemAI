'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [hasSession, setHasSession] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    ;(async () => {
      const url = new URL(window.location.href)
      const code = url.searchParams.get('code')
      if (code) {
        await supabaseBrowser.auth.exchangeCodeForSession(code).catch(() => {})
        url.searchParams.delete('code')
        window.history.replaceState({}, '', url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : ''))
      } else if (window.location.hash) {
        const hash = window.location.hash.replace(/^#/, '')
        const params = new URLSearchParams(hash)
        const access_token = params.get('access_token')
        const refresh_token = params.get('refresh_token')
        if (access_token && refresh_token) {
          await supabaseBrowser.auth.setSession({ access_token, refresh_token }).catch(() => {})
          window.history.replaceState({}, '', url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : ''))
        }
      }

      const { data } = await supabaseBrowser.auth.getSession().catch(() => ({ data: { session: null } } as any))
      setHasSession(!!data?.session)
      setChecking(false)
    })()

    const { data: sub } = supabaseBrowser.auth.onAuthStateChange((_event, session) => {
      setHasSession(!!session)
      setChecking(false)
    })
    return () => {
      sub.subscription.unsubscribe()
    }
  }, [])

  const canSubmit = useMemo(() => {
    if (!hasSession) return false
    if (!password || password.length < 6) return false
    if (password !== confirm) return false
    return true
  }, [hasSession, password, confirm])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setDone(false)
    if (!hasSession) {
      setLoading(false)
      setError('Link không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu gửi lại email.')
      return
    }
    if (password.length < 6) {
      setLoading(false)
      setError('Mật khẩu cần ít nhất 6 ký tự.')
      return
    }
    if (password !== confirm) {
      setLoading(false)
      setError('Mật khẩu xác nhận không khớp.')
      return
    }
    const { error } = await supabaseBrowser.auth.updateUser({ password })
    setLoading(false)
    if (error) {
      setError(error.message || 'Không thể cập nhật mật khẩu. Vui lòng thử lại.')
      return
    }
    setDone(true)
    setTimeout(() => router.replace('/login'), 800)
  }

  return (
    <div className="min-h-[70vh]">
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 items-center px-4">
        <div className="py-10">
          <h1 className="text-[32px] md:text-[38px] font-semibold leading-tight">Đặt lại mật khẩu</h1>
          <p className="mt-2 text-[15px]" style={{color:'var(--text-secondary)'}}>
            Tạo mật khẩu mới cho tài khoản của bạn.
          </p>
        </div>
        <Card className="max-w-md w-full mx-auto md:ml-auto">
          <CardContent>
            <div className="text-center mb-4">
              <div className="text-[20px] font-semibold" style={{color:'var(--text)'}}>Mật khẩu mới</div>
              <div className="text-[14px]" style={{color:'var(--text-muted)'}}>Sau khi đổi, hãy đăng nhập lại.</div>
            </div>

            {checking ? (
              <div className="text-sm" style={{color:'var(--text-muted)'}}>Đang kiểm tra link...</div>
            ) : (
              <form className="space-y-4" onSubmit={onSubmit}>
                <Input placeholder="Mật khẩu mới" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
                <Input placeholder="Nhập lại mật khẩu mới" type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} />
                {!hasSession ? (
                  <div className="text-red-500 text-sm">Link không hợp lệ hoặc đã hết hạn.</div>
                ) : null}
                {done ? (
                  <div className="text-green-400 text-sm">Đổi mật khẩu thành công. Đang chuyển về đăng nhập...</div>
                ) : null}
                {error ? <div className="text-red-500 text-sm">{error}</div> : null}
                <Button disabled={loading || !canSubmit} className="w-full gradient-btn">
                  {loading ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
                </Button>
                <button
                  type="button"
                  className="w-full text-sm underline"
                  style={{color:'var(--gold)'}}
                  onClick={() => router.push('/forgot-password')}
                >
                  Gửi lại email
                </button>
              </form>
            )}

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
