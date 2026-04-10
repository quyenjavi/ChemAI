import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

function normalizeText(v: any) {
  return String(v ?? '').trim().toLowerCase()
}

const ALLOWED = new Set(['english', 'math', 'physics', 'other'])

export async function POST(req: Request) {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const subject = normalizeText(body.subject)
  if (!ALLOWED.has(subject)) return NextResponse.json({ error: 'Invalid subject' }, { status: 400 })

  const other_text = subject === 'other' ? String(body.other_text ?? '').trim() : ''
  if (subject === 'other' && !other_text) return NextResponse.json({ error: 'Missing other_text' }, { status: 400 })

  const svc = serviceRoleClient()

  const clickPromise = svc.from('user_interest_clicks').insert({ user_id: user.id, subject, subject_other: other_text || null } as any)
  const dedupePromise = svc.from('user_interests').upsert({ user_id: user.id, subject, subject_other: other_text || null } as any, { onConflict: 'user_id,subject' } as any)

  const [clickRes, dedupeRes] = await Promise.all([clickPromise, dedupePromise])
  if (clickRes.error) return NextResponse.json({ error: clickRes.error.message }, { status: 500 })
  if (dedupeRes.error) return NextResponse.json({ error: dedupeRes.error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
