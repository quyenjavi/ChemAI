'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/components/AuthProvider'

type Mode = 'menu' | 'bug' | 'teacher'

export default function ContactPage() {
  const [mode, setMode] = useState<Mode>('menu')
  const [sessionUser, setSessionUser] = useState<{ id: string, email?: string, full_name?: string } | null>(null)
  const [okMsg, setOkMsg] = useState('')
  const [errMsg, setErrMsg] = useState('')
  const { user } = useAuth()

  useEffect(() => {
    if (!user?.id) { setSessionUser(null); return }
    setSessionUser({
      id: user.id,
      email: (user.user_metadata?.email || user.email || '') as string,
      full_name: (user.user_metadata?.full_name || '') as string
    })
  }, [user])

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-semibold">Liên hệ</h1>
        <a href="/" className="text-sm underline" style={{color:'var(--gold)'}}>Trang chủ</a>
      </div>
      {mode === 'menu' ? (
        <Card className="border bg-slate-900/40" style={{borderColor:'var(--divider)'}}>
          <CardHeader><CardTitle>Bạn cần hỗ trợ gì?</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => { setMode('bug'); setOkMsg(''); setErrMsg('') }}
              className="text-left cursor-pointer rounded-lg border border-blue-500/25 bg-blue-500/10 hover:bg-blue-500/15 hover:border-blue-500/50 transition-transform hover:scale-[1.02] p-4 space-y-2"
            >
              <div className="text-sm font-semibold">Báo lỗi / Góp ý</div>
              <div className="text-xs" style={{color:'var(--text-muted)'}}>Gặp lỗi hoặc muốn cải thiện ChemAI?</div>
              <div className="text-xs font-semibold" style={{color:'var(--gold)'}}>Gửi ngay</div>
            </button>
            <button
              type="button"
              onClick={() => { setMode('teacher'); setOkMsg(''); setErrMsg('') }}
              className="text-left cursor-pointer rounded-lg border border-emerald-500/25 bg-emerald-500/10 hover:bg-emerald-500/15 hover:border-emerald-500/50 transition-transform hover:scale-[1.02] p-4 space-y-2"
            >
              <div className="text-sm font-semibold">Đăng ký làm giáo viên</div>
              <div className="text-xs" style={{color:'var(--text-muted)'}}>Tạo đề & quản lý học sinh cùng ChemAI</div>
              <div className="text-xs font-semibold" style={{color:'var(--gold)'}}>Đăng ký</div>
            </button>
            <a
              className="block"
              target="_blank"
              rel="noreferrer"
              href="https://www.facebook.com/profile.php?id=61578453523740"
            >
              <div className="text-left cursor-pointer rounded-lg border border-purple-500/25 bg-purple-500/10 hover:bg-purple-500/15 hover:border-purple-500/50 transition-transform hover:scale-[1.02] p-4 space-y-2">
                <div className="text-sm font-semibold">Liên hệ nhanh</div>
                <div className="text-xs" style={{color:'var(--text-muted)'}}>Hỗ trợ nhanh qua Facebook</div>
                <div className="text-xs font-semibold" style={{color:'var(--gold)'}}>Nhắn tin</div>
              </div>
            </a>
          </CardContent>
        </Card>
      ) : null}

      {mode === 'bug' ? <BugForm user={sessionUser} onBack={() => setMode('menu')} onOk={(m)=>setOkMsg(m)} onErr={(m)=>setErrMsg(m)} /> : null}
      {mode === 'teacher' ? <TeacherForm user={sessionUser} onBack={() => setMode('menu')} onOk={(m)=>setOkMsg(m)} onErr={(m)=>setErrMsg(m)} /> : null}

      {okMsg ? <div className="p-3 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-100 text-sm">{okMsg}</div> : null}
      {errMsg ? <div className="p-3 rounded border border-rose-500/30 bg-rose-500/10 text-rose-100 text-sm">{errMsg}</div> : null}
    </div>
  )
}

function BugForm({ user, onBack, onOk, onErr }: { user: any, onBack: ()=>void, onOk: (m:string)=>void, onErr: (m:string)=>void }) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [requestType, setRequestType] = useState<'bug_report' | 'feedback' | 'login_issue' | 'general_contact'>('feedback')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (user) {
      setFullName(user.full_name || '')
      setEmail(user.email || '')
    }
  }, [user])

  async function submit() {
    onOk(''); onErr('')
    setLoading(true)
    const r = await fetch('/api/contact/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: user ? undefined : fullName,
        email: user ? undefined : email,
        phone: user ? phone : phone,
        request_type: requestType,
        subject,
        message
      })
    })
    const j = await r.json().catch(()=>({}))
    setLoading(false)
    if (!r.ok) { onErr(j.error || 'Gửi thất bại'); return }
    setFullName(''); setEmail(''); setPhone(''); setSubject(''); setMessage('')
    onOk('Đã gửi yêu cầu. Cảm ơn bạn!')
    onBack()
  }

  return (
    <Card className="border" style={{borderColor:'var(--divider)'}}>
      <CardHeader><CardTitle>Báo lỗi - Góp ý</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {!user ? (
          <>
            <Input placeholder="Họ tên" value={fullName} onChange={e=>setFullName(e.target.value)} />
            <Input placeholder="Email" type="email" value={email} onChange={e=>setEmail(e.target.value)} />
            <Input placeholder="Số điện thoại" value={phone} onChange={e=>setPhone(e.target.value)} />
          </>
        ) : (
          <Input placeholder="Số điện thoại (tuỳ chọn)" value={phone} onChange={e=>setPhone(e.target.value)} />
        )}
        <div>
          <label className="text-sm">Loại yêu cầu</label>
          <select className="w-full mt-1 border rounded p-2 bg-transparent select-clean" value={requestType} onChange={e=>setRequestType(e.target.value as any)}>
            <option value="bug_report">Báo lỗi</option>
            <option value="feedback">Góp ý</option>
            <option value="login_issue">Vấn đề đăng nhập</option>
            <option value="general_contact">Liên hệ chung</option>
          </select>
        </div>
        <Input placeholder="Tiêu đề" value={subject} onChange={e=>setSubject(e.target.value)} />
        <textarea className="w-full border rounded p-2 bg-transparent min-h-[120px]" placeholder="Nội dung" value={message} onChange={e=>setMessage(e.target.value)} />
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onBack}>Quay lại</Button>
          <Button onClick={submit} disabled={loading}>{loading ? 'Đang gửi...' : 'Gửi'}</Button>
        </div>
      </CardContent>
    </Card>
  )
}

function TeacherForm({ user, onBack, onOk, onErr }: { user: any, onBack: ()=>void, onOk: (m:string)=>void, onErr: (m:string)=>void }) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [school, setSchool] = useState('')
  const [subjectName, setSubjectName] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (user) {
      setFullName(user.full_name || '')
      setEmail(user.email || '')
    }
  }, [user])

  async function submit() {
    onOk(''); onErr('')
    if (!phone.trim()) { onErr('Vui lòng nhập số điện thoại'); return }
    setLoading(true)
    const r = await fetch('/api/contact/teacher', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: user ? undefined : fullName,
        email: user ? undefined : email,
        phone,
        school_name: school,
        subject_name: subjectName,
        message
      })
    })
    const j = await r.json().catch(()=>({}))
    setLoading(false)
    if (!r.ok) { onErr(j.error || 'Gửi thất bại'); return }
    setFullName(''); setEmail(''); setPhone(''); setSchool(''); setSubjectName(''); setMessage('')
    onOk('Đã gửi yêu cầu đăng kí. Chúng tôi sẽ liên hệ sớm!')
    onBack()
  }

  return (
    <Card className="border" style={{borderColor:'var(--divider)'}}>
      <CardHeader><CardTitle>Đăng kí làm giáo viên</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {!user ? (
          <>
            <Input placeholder="Họ tên" value={fullName} onChange={e=>setFullName(e.target.value)} />
            <Input placeholder="Email" type="email" value={email} onChange={e=>setEmail(e.target.value)} />
          </>
        ) : null}
        <Input placeholder="Số điện thoại (bắt buộc)" value={phone} onChange={e=>setPhone(e.target.value)} />
        <Input placeholder="Trường" value={school} onChange={e=>setSchool(e.target.value)} />
        <Input placeholder="Môn dạy" value={subjectName} onChange={e=>setSubjectName(e.target.value)} />
        <textarea className="w-full border rounded p-2 bg-transparent min-h-[120px]" placeholder="Giới thiệu / ghi chú" value={message} onChange={e=>setMessage(e.target.value)} />
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onBack}>Quay lại</Button>
          <Button onClick={submit} disabled={loading}>{loading ? 'Đang gửi...' : 'Gửi'}</Button>
        </div>
      </CardContent>
    </Card>
  )
}
