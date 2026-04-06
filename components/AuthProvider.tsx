'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabaseBrowser } from '@/lib/supabase/client'

type AuthContextValue = {
  session: Session | null
  user: User | null
  loading: boolean
  ensureAuthCookie: () => Promise<boolean>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children, initialSession }: { children: ReactNode, initialSession?: Session | null }) {
  const [session, setSession] = useState<Session | null>(initialSession ?? null)
  const [loading, setLoading] = useState<boolean>(initialSession === undefined)

  const lastSyncedAccessTokenRef = useRef<string | null>(null)
  const syncingRef = useRef(false)

  const ensureAuthCookie = useCallback(async () => {
    if (syncingRef.current) return !!session
    syncingRef.current = true
    try {
      if (!session?.access_token || !session?.refresh_token) {
        await fetch('/api/auth/cookie', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ action: 'signout' })
        }).catch(() => null)
        lastSyncedAccessTokenRef.current = null
        return false
      }

      if (lastSyncedAccessTokenRef.current === session.access_token) return true

      const r = await fetch('/api/auth/cookie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token
        })
      }).catch(() => null)

      if (!r || !r.ok) return false
      lastSyncedAccessTokenRef.current = session.access_token
      return true
    } finally {
      syncingRef.current = false
    }
  }, [session])

  useEffect(() => {
    if (initialSession !== undefined) return
    let cancelled = false
    supabaseBrowser.auth.getSession()
      .then(({ data }) => {
        if (cancelled) return
        setSession(data.session ?? null)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setSession(null)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [initialSession])

  useEffect(() => {
    const { data: sub } = supabaseBrowser.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null)
      setLoading(false)
    })
    return () => {
      sub.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (loading) return
    ensureAuthCookie()
  }, [ensureAuthCookie, loading, session?.access_token])

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    loading,
    ensureAuthCookie
  }), [ensureAuthCookie, loading, session])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const v = useContext(AuthContext)
  if (!v) throw new Error('useAuth must be used within AuthProvider')
  return v
}

