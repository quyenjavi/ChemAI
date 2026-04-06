import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export const maxDuration = 60

function extForUpload(mime: string) {
  const m = String(mime || '').toLowerCase()
  if (m.includes('png')) return 'png'
  if (m.includes('webp')) return 'webp'
  if (m.includes('jpg') || m.includes('jpeg')) return 'jpg'
  if (m.includes('gif')) return 'gif'
  return 'bin'
}

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const form = await req.formData()
    const file = form.get('file') as File | null
    const lessonId = String(form.get('lesson_id') || '').trim()
    if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 })
    if (!lessonId) return NextResponse.json({ error: 'lesson_id is required' }, { status: 400 })

    const svc = serviceRoleClient()
    const { data: teacher } = await svc.from('teacher_profiles').select('id').eq('user_id', user.id).maybeSingle()
    if (!teacher) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const mime = String((file as any).type || 'application/octet-stream')
    const bytes = new Uint8Array(await file.arrayBuffer())
    const ext = extForUpload(mime)
    const safeName = `img-${Date.now()}.${ext}`
    const bucket = 'ChemAI'
    const path = `question_images/lessons/${lessonId}/${safeName}`

    const up = await svc.storage.from(bucket).upload(path, bytes, { contentType: mime, upsert: true })
    if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 })
    const publicUrl = svc.storage.from(bucket).getPublicUrl(path).data.publicUrl

    return NextResponse.json({ url: publicUrl, bucket, path })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}

