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
  const [school, setSchool] = useState('')
  const [className, setClassName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    if (password !== password2) {
      setLoading(false)
      setError('Mật khẩu nhập lại không khớp')
      return
    }
    const { data, error } = await supabaseBrowser.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } }
    })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    // Lưu pending_signups để sau khi verify sẽ tạo hồ sơ
    await fetch('/api/signup/pending', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, full_name: fullName, school, class_name: className })
    }).catch(()=>{})
    router.push('/verify')
  }

  return (
    <Card className="max-w-sm mx-auto">
      <CardHeader>
        <CardTitle>Đăng ký</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={onSubmit}>
          <Input placeholder="Họ tên" value={fullName} onChange={e=>setFullName(e.target.value)} />
          <Input placeholder="Email" type="email" value={email} onChange={e=>setEmail(e.target.value)} />
          <Input placeholder="Mật khẩu" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
          <Input placeholder="Nhập lại mật khẩu" type="password" value={password2} onChange={e=>setPassword2(e.target.value)} />
          <Input placeholder="Trường" value={school} onChange={e=>setSchool(e.target.value)} />
          <Input placeholder="Lớp" value={className} onChange={e=>setClassName(e.target.value)} />
          {error ? <div className="text-red-600 text-sm">{error}</div> : null}
          <Button disabled={loading} className="w-full">
            {loading ? 'Đang đăng ký...' : 'Đăng ký'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
