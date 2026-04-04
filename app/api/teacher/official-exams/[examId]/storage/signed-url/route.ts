import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export const maxDuration = 60

export async function POST(req: Request, { params }: { params: { examId: string } }) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const bucket = String(body.bucket || '').trim()
    const path = String(body.path || '').trim()
    const expires_in = Math.max(10, Math.min(60 * 10, Number(body.expires_in || 60)))

    if (!bucket) return NextResponse.json({ error: 'bucket is required' }, { status: 400 })
    if (!path) return NextResponse.json({ error: 'path is required' }, { status: 400 })

    if (bucket !== 'chemai-official-exams') {
      return NextResponse.json({ error: 'Forbidden bucket' }, { status: 403 })
    }
    const expectedPrefix = `official_exams/${params.examId}/`
    if (!path.startsWith(expectedPrefix)) {
      return NextResponse.json({ error: 'Forbidden path' }, { status: 403 })
    }

    const svc = serviceRoleClient()
    const { data: teacher } = await svc
      .from('teacher_profiles')
      .select('user_id,can_create_exam,school_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!teacher || !teacher.can_create_exam) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: exam } = await svc.from('official_exams').select('id,school_id').eq('id', params.examId).maybeSingle()
    if (!exam || exam.school_id !== teacher.school_id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const signed = await svc.storage.from(bucket).createSignedUrl(path, expires_in)
    if (signed.error) return NextResponse.json({ error: signed.error.message }, { status: 500 })

    return NextResponse.json({ signed_url: signed.data.signedUrl, expires_in })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}

