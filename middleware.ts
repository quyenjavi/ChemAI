import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const maintenanceEnabled = String(process.env.NEXT_PUBLIC_MAINTENANCE_MODE || '').toLowerCase() === 'true'
  const { pathname } = req.nextUrl

  if (pathname === '/about') {
    const url = req.nextUrl.clone()
    url.pathname = '/introduce.html'
    return NextResponse.rewrite(url)
  }

  const isPublic =
    pathname.startsWith('/login') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/about') ||
    pathname.startsWith('/verify') ||
    pathname.startsWith('/maintenance') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname === '/'

  if (!maintenanceEnabled) {
    if (pathname.startsWith('/api') || pathname.startsWith('/_next') || pathname.startsWith('/favicon')) return res
  }

  const supabase = createMiddlewareClient({
    req,
    res,
    cookieOptions: {
      maxAge: 60 * 60 * 24 * 15,
      path: '/',
      sameSite: 'lax',
    },
  } as any)
  const { data: { session } } = await supabase.auth.getSession()

  if (maintenanceEnabled) {
    const maintenancePublic =
      pathname.startsWith('/maintenance') ||
      pathname.startsWith('/login') ||
      pathname.startsWith('/forgot-password') ||
      pathname.startsWith('/reset-password') ||
      pathname.startsWith('/signup') ||
      pathname.startsWith('/about') ||
      pathname.startsWith('/verify') ||
      pathname.startsWith('/api') ||
      pathname.startsWith('/_next') ||
      pathname.startsWith('/favicon') ||
      pathname === '/'

    if (!session) {
      if (!maintenancePublic || pathname === '/') {
        const url = req.nextUrl.clone()
        url.pathname = '/maintenance'
        return NextResponse.redirect(url)
      }
      return res
    }

    const { data: teacherRow } = await supabase
      .from('teacher_profiles')
      .select('id')
      .eq('user_id', session.user.id)
      .maybeSingle()
    const isTeacher = !!teacherRow

    if (!isTeacher && !pathname.startsWith('/maintenance')) {
      const url = req.nextUrl.clone()
      url.pathname = '/maintenance'
      return NextResponse.redirect(url)
    }

    if (isTeacher && (pathname === '/login' || pathname === '/verify' || pathname === '/' || pathname.startsWith('/maintenance'))) {
      const url = req.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }

    return res
  }

  if (!session && !isPublic) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (session && (pathname === '/login' || pathname === '/verify')) {
    const url = req.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  if (pathname === '/' && !session) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return res
}

export const config = {
  matcher: ['/((?!.*\\.).*)'],
}
