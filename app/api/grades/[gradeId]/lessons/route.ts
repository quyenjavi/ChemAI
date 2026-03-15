import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

export async function GET(req: Request, { params }: { params: { gradeId: string } }) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const svc = serviceRoleClient()
    const { data } = await svc
      .from('lessons')
      .select('id, grade_id, title, description, is_visible, lesson_type, question_count, is_teacher_recommended, display_order, created_at')
      .eq('grade_id', params.gradeId)
      .eq('is_visible', true)
      .order('is_teacher_recommended', { ascending: false })
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
    return NextResponse.json(data || [])
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
