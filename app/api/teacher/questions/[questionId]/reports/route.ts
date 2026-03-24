import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export async function GET(_: Request, { params }: { params: { questionId: string } }) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Check if user is teacher (optional, but good practice)
    const { data: teacher } = await supabase.from('teacher_profiles').select('id').eq('user_id', user.id).maybeSingle()
    if (!teacher) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const svc = serviceRoleClient()
    const { data: reports, error } = await svc
      .from('question_reports')
      .select('*')
      .eq('question_id', params.questionId)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ reports: reports || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
