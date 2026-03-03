'use client'
import { useEffect, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default function ProfilePage() {
  const [fullName, setFullName] = useState('')
  const [school, setSchool] = useState('')
  const [className, setClassName] = useState('')
  const [academicYear, setAcademicYear] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    supabaseBrowser.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.push('/login')
        return
      }
      const { data: existing } = await supabaseBrowser
        .from('student_profiles')
        .select('*')
        .eq('user_id', data.user.id)
        .maybeSingle()
      if (existing) {
        router.push('/dashboard')
      }
    })
  }, [router])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await fetch('/api/profile/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: fullName, school, class_name: className, academic_year: academicYear, birth_date: birthDate })
    })
    setLoading(false)
    if (!res.ok) {
      const x = await res.json().catch(()=>({ error: 'Lỗi' }))
      setError(x.error || 'Lỗi')
      return
    }
    router.push('/dashboard')
  }

  return (
    <Card className="max-w-lg mx-auto">
      <CardHeader>
        <CardTitle>Hồ sơ học sinh</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-3">
          <Input placeholder="Họ tên" value={fullName} onChange={e=>setFullName(e.target.value)} />
          <Input placeholder="Trường" value={school} onChange={e=>setSchool(e.target.value)} />
          <Input placeholder="Lớp" value={className} onChange={e=>setClassName(e.target.value)} />
          <Input placeholder="Năm học" value={academicYear} onChange={e=>setAcademicYear(e.target.value)} />
          <Input placeholder="Ngày sinh" type="date" value={birthDate} onChange={e=>setBirthDate(e.target.value)} />
          {error ? <div className="text-red-600 text-sm">{error}</div> : null}
          <Button disabled={loading}>
            {loading ? 'Đang lưu...' : 'Lưu hồ sơ'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
