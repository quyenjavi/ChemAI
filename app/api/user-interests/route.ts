import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

function normalizeText(v: any) {
  return String(v ?? '').trim().toLowerCase()
}

const ALLOWED = new Set(['english', 'math', 'physics'])

export async function POST(req: Request) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const subject = normalizeText(body.subject)
  if (!ALLOWED.has(subject)) return NextResponse.json({ error: 'Invalid subject' }, { status: 400 })

  const svc = serviceRoleClient()

  const clickPromise = svc.from('user_interest_clicks').insert({ user_id: user.id, subject } as any)
  const dedupePromise = svc.from('user_interests').upsert({ user_id: user.id, subject } as any, { onConflict: 'user_id,subject', ignoreDuplicates: true } as any)

  const [clickRes, dedupeRes] = await Promise.all([clickPromise, dedupePromise])
  if (clickRes.error) return NextResponse.json({ error: clickRes.error.message }, { status: 500 })
  if (dedupeRes.error) return NextResponse.json({ error: dedupeRes.error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
