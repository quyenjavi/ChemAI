'use client'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

export default function SignOutButton() {
  const router = useRouter()
  async function signOut() {
    await supabaseBrowser.auth.signOut()
    router.push('/login')
  }
  return <Button size="sm" variant="outline" onClick={signOut}>Đăng xuất</Button>
}
