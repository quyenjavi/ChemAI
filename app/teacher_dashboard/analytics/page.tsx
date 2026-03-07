import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { serviceRoleClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export default async function TeacherAnalyticsPage() {
  const cookieStore = cookies()
  const supabase = createServerComponentClient({ cookies: () => cookieStore } as any)
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user?.id) redirect('/login')
  const uid = session.user.id
  const { data: t } = await supabase.from('teacher_profiles').select('user_id').eq('user_id', uid).maybeSingle()
  if (!t) redirect('/dashboard')
  const svc = serviceRoleClient()
  const { data: assignments } = await svc.from('teacher_class_assignments').select('class_id').eq('teacher_user_id', uid)
  const classIds = Array.from(new Set((assignments || []).map((a: any) => a.class_id).filter(Boolean)))
  const { data: students } = classIds.length ? await svc.from('student_profiles').select('user_id').in('class_id', classIds) : { data: [] }
  const studentIds = Array.from(new Set((students || []).map((s: any) => s.user_id)))
  const { data: attempts } = studentIds.length ? await svc.from('quiz_attempts').select('id,user_id,lesson_id,score_percent,created_at').in('user_id', studentIds).order('created_at', { ascending: false }).limit(1000) : { data: [] }
  // top lessons
  const lessonCount: Record<string, number> = {}
  for (const a of (attempts || []) as any[]) {
    const lid = a.lesson_id
    if (lid) lessonCount[lid] = (lessonCount[lid] || 0) + 1
  }
  const sortedLessons = Object.entries(lessonCount).sort((x, y) => y[1] - x[1]).slice(0, 5)
  const lessonIds = sortedLessons.map(([lid]) => lid)
  const { data: lessonRows } = lessonIds.length ? await svc.from('lessons').select('id,title').in('id', lessonIds) : { data: [] }
  const titleById: Record<string, string> = Object.fromEntries((lessonRows || []).map((l: any) => [l.id, l.title || 'Bài học']))
  // wrong questions + topic accuracy
  const attemptIds = Array.from(new Set((attempts || []).map((a: any) => a.id)))
  const { data: answers } = attemptIds.length ? await svc.from('quiz_attempt_answers').select('question_id,is_correct,attempt_id').in('attempt_id', attemptIds) : { data: [] }
  const qIds = Array.from(new Set(((answers || []) as any[]).map(a => a.question_id).filter(Boolean)))
  const { data: qRows } = qIds.length ? await svc.from('questions').select('id,topic').in('id', qIds) : { data: [] }
  const topicByQ: Record<string, string> = Object.fromEntries((qRows || []).map((q: any) => [q.id, q.topic || '']))
  const topicStats: Record<string, { total: number, wrong: number }> = {}
  const wrongCount: Record<string, number> = {}
  for (const a of (answers || []) as any[]) {
    const qid = a.question_id
    const tp = topicByQ[qid] || ''
    if (!tp) continue
    const st = topicStats[tp] || { total: 0, wrong: 0 }
    st.total += 1
    if (a.is_correct === false) {
      st.wrong += 1
      wrongCount[qid] = (wrongCount[qid] || 0) + 1
    }
    topicStats[tp] = st
  }
  const topicAcc = Object.entries(topicStats).map(([tp, st]) => ({ tp, acc: st.total ? Math.round(((st.total - st.wrong) / st.total) * 100) : 0 })).sort((x, y) => x.acc - y.acc).slice(0, 5)
  const topWrong = Object.entries(wrongCount).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([qid, c]) => ({ qid, c }))
  const { data: wrongQs } = topWrong.length ? await svc.from('questions').select('id,content,topic').in('id', topWrong.map(w => w.qid)) : { data: [] }
  const wrongById: Record<string, { content: string, topic: string }> = Object.fromEntries((wrongQs || []).map((q: any) => [q.id, { content: q.content, topic: q.topic || '' }]))

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Phân tích lớp học</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Bài được làm nhiều nhất</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {sortedLessons.map(([lid, count]) => (
                <li key={lid}>{titleById[lid] || lid}: {count} lượt</li>
              ))}
              {sortedLessons.length === 0 ? <div className="text-sm" style={{color:'var(--text-muted)'}}>Chưa có dữ liệu</div> : null}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Chủ đề có kết quả thấp</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {topicAcc.map(({ tp, acc }) => (
                <li key={tp}>{tp || 'Chủ đề'}: {acc}% chính xác</li>
              ))}
              {topicAcc.length === 0 ? <div className="text-sm" style={{color:'var(--text-muted)'}}>Chưa có dữ liệu</div> : null}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Câu hỏi sai nhiều nhất</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {topWrong.map(w => (
                <li key={w.qid}>{wrongById[w.qid]?.content || w.qid} {wrongById[w.qid]?.topic ? `(Chủ đề: ${wrongById[w.qid].topic})` : ''} — {w.c} lần sai</li>
              ))}
              {topWrong.length === 0 ? <div className="text-sm" style={{color:'var(--text-muted)'}}>Chưa có dữ liệu</div> : null}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
