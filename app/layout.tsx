import './globals.css'
import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import SignOutButton from '@/components/SignOutButton'

export const metadata: Metadata = {
  icons: [
    { rel: 'icon', url: '/favicon', type: 'image/png' },
    { rel: 'shortcut icon', url: '/favicon', type: 'image/png' }
  ]
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const cookieStore = cookies()
  const supabase = createServerComponentClient({ cookies: () => cookieStore } as any)
  const { data: { session } } = await supabase.auth.getSession()
  return (
    <html lang="vi">
      <body className="min-h-screen">
        <header className="border-b border-[var(--divider)] bg-[rgba(255,255,255,0.06)] backdrop-blur">
          <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
            <Link href="/" aria-label="Trang chủ">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M3 10.5L12 3l9 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5 10v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
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
