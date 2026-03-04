import './globals.css'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import SignOutButton from '@/components/SignOutButton'

export default async function RootLayout({ children }: { children: ReactNode }) {
  const cookieStore = cookies()
  const supabase = createServerComponentClient({ cookies: () => cookieStore } as any)
  const { data: { session } } = await supabase.auth.getSession()
  return (
    <html lang="vi">
      <body className="min-h-screen">
        <header className="border-b border-[var(--divider)] bg-[rgba(255,255,255,0.06)] backdrop-blur">
          <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
            <Link href="/" className="font-semibold text-lg" style={{color:'var(--gold)'}}>
              ChemAI Uyển Sensei
            </Link>
            <div className="flex items-center gap-2">
              {session ? <Link href="/profile" className="text-sm underline" style={{color:'var(--gold)'}}>Hồ sơ</Link> : null}
              {session ? <SignOutButton /> : null}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">
          {children}
        </main>
        <footer className="border-t border-[var(--divider)]">
          <div className="mx-auto max-w-6xl px-4 py-6 text-xs" style={{color:'var(--text-muted)'}}>
            © 2026 ChemAI Uyển Sensei
          </div>
        </footer>
      </body>
    </html>
  )
}
