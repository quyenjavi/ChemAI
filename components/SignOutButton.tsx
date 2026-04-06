'use client'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

export default function SignOutButton() {
  const router = useRouter()
  async function signOut() {
    await supabaseBrowser.auth.signOut()
    await fetch('/api/auth/cookie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action: 'signout' })
    }).catch(() => null)
    router.replace('/login')
    router.refresh()
  }
  return <Button size="sm" variant="outline" onClick={signOut}>Đăng xuất</Button>
}
