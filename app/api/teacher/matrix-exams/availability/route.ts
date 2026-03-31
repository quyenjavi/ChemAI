import { NextResponse } from 'next/server'
import { createSupabaseServer, serviceRoleClient } from '@/lib/supabase/server'

function mapQuestionTypeToDb(questionType: string) {
  return questionType === 'true_false' ? 'true_false_group' : questionType
}

function encodeUnit(unit: string) {
  return encodeURIComponent(unit)
}

export async function GET(req: Request) {
  try {
    const supabase = createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const lessonIdsParam = String(url.searchParams.get('lesson_ids') || '').trim()
    const legacyLessonId = String(url.searchParams.get('lesson_id') || '').trim()
    const lessonIds = lessonIdsParam
      ? lessonIdsParam.split(',').map(s => s.trim()).filter(Boolean)
      : (legacyLessonId ? [legacyLessonId] : [])
    if (!lessonIds.length) return NextResponse.json({ error: 'lesson_ids is required' }, { status: 400 })

    const svc = serviceRoleClient()
    const { data: teacher } = await svc
      .from('teacher_profiles')
      .select('user_id,can_create_exam')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!teacher || !teacher.can_create_exam) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: rows, error } = await svc
      .from('questions')
      .select('id,lesson_id,question_type,topic_unit,difficulty_academic,created_at')
      .in('lesson_id', lessonIds)
      .order('lesson_id', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(50000)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const counts: Record<string, number> = {}
    const diffs = new Set<string>()
    const topicUnitsByLesson = new Map<string, string[]>()
    const topicUnitsSeenByLesson = new Map<string, Set<string>>()

    for (const r of rows || []) {
      const qt = mapQuestionTypeToDb(String((r as any).question_type || '').trim())
      const lesson_id = String((r as any).lesson_id || '').trim()
      const unit = String((r as any).topic_unit || '').trim()
      const diff = String((r as any).difficulty_academic || '').trim()
      if (!qt || !lesson_id || !unit || !diff) continue
      diffs.add(diff)
      const encodedUnit = encodeUnit(unit)
      const key = `${qt}||${lesson_id}||${encodedUnit}||${diff}`
      counts[key] = (counts[key] || 0) + 1

      if (!topicUnitsByLesson.has(lesson_id)) topicUnitsByLesson.set(lesson_id, [])
      if (!topicUnitsSeenByLesson.has(lesson_id)) topicUnitsSeenByLesson.set(lesson_id, new Set<string>())
      const seen = topicUnitsSeenByLesson.get(lesson_id)!
      if (!seen.has(unit)) {
        seen.add(unit)
        topicUnitsByLesson.get(lesson_id)!.push(unit)
      }
    }

    const { data: lessonsRaw } = await svc
      .from('lessons')
      .select('id,title')
      .in('id', lessonIds)
      .limit(2000)
    const lessonTitleById = new Map((lessonsRaw || []).map((l: any) => [l.id, l.title]))
    const lessons = lessonIds.map(id => ({
      id,
      title: lessonTitleById.get(id) || id,
      topic_units: (topicUnitsByLesson.get(id) || []).map(u => ({
        key: `${id}::${encodeUnit(u)}`,
        topic_unit: u
      }))
    }))

    return NextResponse.json({
      counts,
      lessons,
      difficulty_academic_values: Array.from(diffs).sort((a, b) => a.localeCompare(b)),
      lesson_ids: lessonIds
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
