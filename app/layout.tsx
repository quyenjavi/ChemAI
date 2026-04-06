import './globals.css'
import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import SignOutButton from '@/components/SignOutButton'
import { AuthProvider } from '@/components/AuthProvider'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

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
  let fullName = ''
  let isTeacher = false
  if (session?.user?.id) {
    fullName = (session.user.user_metadata?.full_name || '') as string
    const { data: t } = await supabase.from('teacher_profiles').select('user_id').eq('user_id', session.user.id).maybeSingle()
    isTeacher = !!t
  }
  return (
    <html lang="vi">
      <body className="min-h-screen">
        <AuthProvider initialSession={session ?? null}>
          <header className="border-b border-[var(--divider)] bg-[rgba(255,255,255,0.06)] backdrop-blur">
            <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
              <Link href={session ? "/dashboard" : "/"} aria-label="Trang chủ" prefetch={false}>
                <span className="flex items-center gap-2">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M3 10.5L12 3l9 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M5 10v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  <span className="text-xs sm:text-sm font-semibold tracking-wide" style={{color:'var(--gold)'}}>CHEMAI LUYỆN HÓA THPT</span>
                </span>
              </Link>
              {session ? (
                <>
                  <div className="hidden sm:flex items-center gap-2">
                    <span className="text-sm font-semibold" style={{color:'var(--text)'}}>Xin chào, {fullName || 'bạn'}</span>
                    {isTeacher ? <Link href="/teacher_dashboard" prefetch={false} className="text-sm underline" style={{color:'var(--gold)'}}>Giáo viên</Link> : null}
                    <Link href="/profile" prefetch={false} className="text-sm underline" style={{color:'var(--gold)'}}>Hồ sơ</Link>
                    <Link href="/study-history" prefetch={false} className="text-sm underline" style={{color:'var(--gold)'}}>Lịch sử học tập</Link>
                    <Link href="/contact" prefetch={false} className="text-sm underline font-semibold" style={{color:'var(--gold)'}}>💬 Hỗ trợ</Link>
                    <SignOutButton />
                  </div>
                  <div className="sm:hidden">
                    <details className="relative">
                      <summary
                        aria-label="Mở menu"
                        className="list-none cursor-pointer select-none rounded-md border border-[var(--divider)] px-2 py-2"
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M4 7h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          <path d="M4 12h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          <path d="M4 17h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </summary>
                      <div className="absolute right-0 mt-2 w-56 rounded-md border border-[var(--divider)] bg-slate-950/95 backdrop-blur p-2 shadow-lg">
                        <div className="px-3 py-2 text-sm font-semibold" style={{color:'var(--text)'}}>Xin chào, {fullName || 'bạn'}</div>
                        {isTeacher ? <Link href="/teacher_dashboard" prefetch={false} className="block px-3 py-2 text-sm rounded hover:bg-slate-800/60" style={{color:'var(--gold)'}}>Giáo viên dashboard</Link> : null}
                        <Link href="/profile" prefetch={false} className="block px-3 py-2 text-sm rounded hover:bg-slate-800/60" style={{color:'var(--gold)'}}>Hồ sơ</Link>
                        <Link href="/study-history" prefetch={false} className="block px-3 py-2 text-sm rounded hover:bg-slate-800/60" style={{color:'var(--gold)'}}>Lịch sử học tập</Link>
                        <Link href="/contact" prefetch={false} className="block px-3 py-2 text-sm rounded hover:bg-slate-800/60 font-semibold" style={{color:'var(--gold)'}}>💬 Hỗ trợ</Link>
                        <div className="px-3 py-2">
                          <SignOutButton />
                        </div>
                      </div>
                    </details>
                  </div>
                </>
              ) : null}
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-4 py-6">
            {children}
          </main>
          <footer className="border-t border-[var(--divider)]">
            <div className="mx-auto max-w-6xl px-4 py-6 text-xs" style={{color:'var(--text-muted)'}}>
              <div className="flex items-center justify-between">
                <span>© 2026 ChemAI Uyển Sensei</span>
                {!session ? <a href="/contact" className="underline" style={{color:'var(--gold)'}}>Liên hệ</a> : null}
              </div>
            </div>
          </footer>
        </AuthProvider>
      </body>
    </html>
  )
}
