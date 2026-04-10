'use client'
import { useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [showPass2, setShowPass2] = useState(false)
  const router = useRouter()

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  const passLenOk = password.length >= 8
  const passMatch = password === password2
  const formValid = !!(
    fullName &&
    emailValid &&
    passLenOk &&
    passMatch
  )

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    if (!formValid) {
      setLoading(false)
      if (!passLenOk) {
        setError('Mật khẩu phải có ít nhất 8 ký tự')
      } else if (!emailValid) {
        setError('Email không hợp lệ')
      } else if (!passMatch) {
        setError('Mật khẩu nhập lại không khớp')
      } else {
        setError('Vui lòng nhập đầy đủ thông tin bắt buộc')
      }
      return
    }
    if (!passMatch) {
      setLoading(false)
      setError('Mật khẩu nhập lại không khớp')
      return
    }
    const r = await fetch('/api/auth/instant-signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        full_name: fullName
      })
    })
    if (!r.ok) {
      const j = await r.json().catch(()=>({}))
      setLoading(false)
      setError(j.error || 'Đăng ký thất bại')
      return
    }
    const { error: signInErr } = await supabaseBrowser.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (signInErr) {
      setError(signInErr.message)
      return
    }
    router.push('/dashboard')
  }

  return (
    <Card className="max-w-sm mx-auto">
      <CardHeader>
        <CardTitle>Đăng ký</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={onSubmit}>
          <Input placeholder="Họ tên" value={fullName} onChange={e=>setFullName(e.target.value)} required />
          <Input placeholder="Email" type="email" value={email} onChange={e=>setEmail(e.target.value)} required />
          <div className="relative">
            <Input placeholder="Mật khẩu" type={showPass ? 'text' : 'password'} value={password} onChange={e=>setPassword(e.target.value)} required />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-sm opacity-70 hover:opacity-100"
              onClick={() => setShowPass(s => !s)}
              aria-label={showPass ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            >
              {showPass ? '🙈' : '👁️'}
            </button>
          </div>
          {!passLenOk ? <div className="text-red-600 text-xs">Mật khẩu phải có ít nhất 8 ký tự</div> : null}
          <div className="relative">
            <Input placeholder="Nhập lại mật khẩu" type={showPass2 ? 'text' : 'password'} value={password2} onChange={e=>setPassword2(e.target.value)} required />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-sm opacity-70 hover:opacity-100"
              onClick={() => setShowPass2(s => !s)}
              aria-label={showPass2 ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            >
              {showPass2 ? '🙈' : '👁️'}
            </button>
          </div>
          {passLenOk && !passMatch ? <div className="text-red-600 text-xs">Mật khẩu nhập lại không khớp</div> : null}
          {error ? <div className="text-red-600 text-sm">{error}</div> : null}
          <Button disabled={loading || !formValid} className="w-full">
            {loading ? 'Đang đăng ký...' : 'Đăng ký'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
