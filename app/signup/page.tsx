'use client'
import { useEffect, useState } from 'react'
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
  const [school, setSchool] = useState('Trường THPT Phạm Phú Thứ')
  const [className, setClassName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const router = useRouter()

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  const formValid = !!(fullName && emailValid && password && password2 && school && className && password === password2)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setInterval(() => setCooldown(s => (s > 0 ? s - 1 : 0)), 1000)
    return () => clearInterval(t)
  }, [cooldown])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (cooldown > 0) return
    setLoading(true)
    setError('')
    if (!formValid) {
      setLoading(false)
      if (!emailValid) {
        setError('Email không hợp lệ')
      } else if (password !== password2) {
        setError('Mật khẩu nhập lại không khớp')
      } else {
        setError('Vui lòng nhập đầy đủ thông tin bắt buộc')
      }
      return
    }
    if (password !== password2) {
      setLoading(false)
      setError('Mật khẩu nhập lại không khớp')
      return
    }
    const r = await fetch('/api/auth/instant-signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, full_name: fullName, school, class_name: className })
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
    await fetch('/api/profile/migrate', { method: 'POST' }).catch(()=>{})
    router.push('/profile')
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
          <Input placeholder="Mật khẩu" type="password" value={password} onChange={e=>setPassword(e.target.value)} required />
          <Input placeholder="Nhập lại mật khẩu" type="password" value={password2} onChange={e=>setPassword2(e.target.value)} required />
          <Input placeholder="Trường" value={school} onChange={e=>setSchool(e.target.value)} required />
          <Input placeholder="Lớp" value={className} onChange={e=>setClassName(e.target.value)} required />
          {error ? <div className="text-red-600 text-sm">{error}</div> : null}
          <Button disabled={loading || cooldown>0 || !formValid} className="w-full">
            {loading ? 'Đang đăng ký...' : (cooldown>0 ? `Thử lại sau ${cooldown}s` : 'Đăng ký')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
