'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useAuth } from '@/components/AuthProvider'
type Grade = { id: string, name: string }
type Lesson = {
  id: string,
  grade_id: string,
  title: string,
  description: string | null,
  lesson_type?: 'practice' | 'exam' | string | null,
  question_count?: number | null,
  is_teacher_recommended?: boolean | null,
  display_order?: number | null
}

const TopTab = dynamic(() => import('./TopTab'), {
  ssr: false,
  loading: () => <div className="text-sm" style={{color:'var(--text-muted)'}}>Đang tải...</div>
})

export default function Dashboard() {
  const router = useRouter()
  const { user } = useAuth()
  const [grades, setGrades] = useState<Grade[]>([])
  const [activeGradeId, setActiveGradeId] = useState<string | null>(null)
  const [preferredGradeId, setPreferredGradeId] = useState<string | null>(null)
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [search, setSearch] = useState('')
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [questionCounts, setQuestionCounts] = useState<Record<string, number>>({})
  const [slogan, setSlogan] = useState('')
  const [startLoading, setStartLoading] = useState<{ lesson_id: string, lesson_type: 'exam' | 'practice' } | null>(null)
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    if (!s) return lessons
    return lessons.filter(l => l.title.toLowerCase().includes(s))
  }, [search, lessons])

  useEffect(() => {
    ;(async () => {
      if (!user?.id) return
      const { data: profile } = await supabaseBrowser
        .from('student_profiles')
        .select('grade_id')
        .eq('user_id', user.id)
        .maybeSingle()
      const gid = profile?.grade_id ? String(profile.grade_id) : null
      if (gid) setPreferredGradeId(gid)
    })()
  }, [user?.id])

  useEffect(() => {
    supabaseBrowser.from('grades').select('*').order('created_at', { ascending: true }).then(({ data }) => {
      if (data && data.length) {
        setGrades(data as any)
      }
    })
  }, [])

  useEffect(() => {
    if (activeGradeId) return
    if (!grades.length) return
    const match = preferredGradeId && grades.some(g => g.id === preferredGradeId) ? preferredGradeId : null
    setActiveGradeId(match || grades[0].id)
  }, [activeGradeId, grades, preferredGradeId])

  useEffect(() => {
    if (!activeGradeId || activeGradeId === 'top') return
    fetch(`/api/grades/${activeGradeId}/lessons`, { credentials: 'include' })
      .then(async r => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}))
          throw new Error(j.error || 'Lỗi tải danh sách bài học')
        }
        return r.json()
      })
      .then(async (data: Lesson[]) => {
        const list = (data || []) as Lesson[]
        setLessons(list)
        setCounts(Object.fromEntries(list.map(ls => [ls.id, Math.max(0, Number(ls.question_count) || 0)])))
      })
      .catch(() => {})
  }, [activeGradeId])

  useEffect(() => {
    const slogans = [
      'Hóa học là ngôn ngữ của tự nhiên. Ai hiểu nó sẽ hiểu thế giới.',
      'Mỗi phản ứng hóa học là một câu chuyện về sự biến đổi.',
      'Khoa học bắt đầu từ sự tò mò, và hóa học là hành trình đi tìm câu trả lời.',
      'Một phương trình cân bằng là minh chứng cho sự hài hòa của tự nhiên.',
      'Sai lầm trong thí nghiệm không phải thất bại, đó là dữ liệu cho khám phá mới.',
      'Hóa học giúp chúng ta nhìn thấy điều kỳ diệu trong những thứ nhỏ bé nhất.',
      'Đằng sau mỗi phân tử là cả một thế giới đang chuyển động.',
      'Hiểu hóa học là hiểu cách vật chất biến đổi và tồn tại.',
      'Hóa học không chỉ nằm trong phòng thí nghiệm, nó có trong mọi hơi thở của cuộc sống.',
      'Từ một tia lửa tò mò có thể bùng lên cả một khám phá khoa học.',
      'Những phản ứng nhỏ có thể tạo nên những thay đổi lớn.',
      'Trong hóa học, sự kiên nhẫn chính là chất xúc tác cho thành công.',
      'Mỗi thí nghiệm là một bước tiến gần hơn đến tri thức.',
      'Hóa học dạy chúng ta rằng mọi thứ đều có thể biến đổi.',
      'Một nhà hóa học giỏi không chỉ nhớ công thức, mà còn hiểu bản chất.',
      'Tri thức giống như phản ứng dây chuyền: càng học càng lan tỏa.',
      'Mỗi câu hỏi khoa học đều là khởi đầu của một khám phá.',
      'Thế giới được xây dựng từ những nguyên tử nhỏ bé nhưng kỳ diệu.',
      'Đừng sợ những phương trình phức tạp, chúng chỉ đang kể một câu chuyện sâu sắc.',
      'Hóa học là nghệ thuật hiểu và điều khiển sự biến đổi của vật chất.',
      'Mỗi sai lầm hôm nay là một bước tiến cho thành công ngày mai.',
      'Kiến thức hóa học là chìa khóa mở ra nhiều công nghệ của tương lai.',
      'Một nhà khoa học giỏi luôn bắt đầu bằng câu hỏi “tại sao”.',
      'Hóa học cho ta thấy rằng những điều nhỏ bé nhất có thể tạo nên thế giới.',
      'Mỗi phản ứng là một cuộc gặp gỡ của các nguyên tử.',
      'Học hóa học là học cách nhìn thế giới ở cấp độ sâu hơn.',
      'Trong khoa học, tò mò là động lực mạnh mẽ nhất.',
      'Hóa học biến sự bí ẩn của tự nhiên thành tri thức.',
      'Khám phá khoa học bắt đầu từ những thí nghiệm nhỏ nhất.',
      'Khi hiểu hóa học, bạn sẽ thấy thế giới trở nên thú vị hơn bao giờ hết.'
    ]
    const msg = slogans[Math.floor(Math.random() * slogans.length)]
    setSlogan(msg)
  }, [])

  const startMessages = useMemo(() => {
    const practice = [
      'Cố gắng từng câu một, sai đâu sửa đó là tiến bộ rồi.',
      'Hít thở sâu, làm chậm mà chắc. Em làm được.',
      'Đừng sợ sai. Mỗi lỗi là một bước gần hơn tới đúng.',
      'Chọn câu dễ trước để lấy đà, rồi quay lại câu khó.',
      'Tập trung vào câu trước mắt, đừng vội nghĩ tới kết quả.'
    ]
    const exam = [
      'Bình tĩnh đọc kỹ đề, chú ý từ khóa và đơn vị.',
      'Canh thời gian: làm câu dễ trước, câu khó để sau.',
      'Nếu kẹt quá 60–90 giây, đánh dấu rồi chuyển câu khác.',
      'Trước khi nộp, rà lại các câu bỏ trống và câu phân vân.',
      'Giữ nhịp thở đều, tránh hoảng khi gặp câu lạ.'
    ]
    return { practice, exam }
  }, [])

  const loadingText = useMemo(() => {
    if (!startLoading) return ''
    const arr = startLoading.lesson_type === 'exam' ? startMessages.exam : startMessages.practice
    return arr[Math.floor(Math.random() * arr.length)] || ''
  }, [startLoading, startMessages])

  return (
    <div className="space-y-8">
      {startLoading ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
          <div className="w-[92%] max-w-md rounded-xl border border-slate-700/60 bg-slate-900/60 p-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full border-2 border-blue-400/40 border-t-blue-400 animate-spin" />
              <div>
                <div className="text-lg font-semibold text-gray-100">Đang chuẩn bị bài...</div>
                <div className="text-sm text-gray-200/70">{startLoading.lesson_type === 'exam' ? 'Thi thử' : 'Luyện tập'}</div>
              </div>
            </div>
            {loadingText ? (
              <div className="mt-4 text-sm text-gray-200 whitespace-pre-line">{loadingText}</div>
            ) : null}
            <div className="mt-5 h-2 w-full rounded bg-slate-700/40 overflow-hidden">
              <div className="h-full w-1/2 bg-blue-500/70 animate-pulse" />
            </div>
          </div>
        </div>
      ) : null}
      <h1 className="text-[28px] sm:text-[32px] font-semibold">Chọn bài học</h1>
      {slogan ? (
        <div className="text-[14px] mt-1 italic font-medium" style={{color:'var(--gold)'}} aria-live="polite">
          {slogan}
        </div>
      ) : null}
      <div className="flex gap-3 overflow-x-auto" role="tablist" aria-label="Chọn lớp">
        {grades.map(g => (
          <Button
            key={g.id}
            onClick={() => setActiveGradeId(g.id)}
            role="tab"
            aria-selected={activeGradeId===g.id}
            variant={activeGradeId===g.id ? 'default' : 'outline'}
            className="h-9 px-3 text-sm"
          >
            {g.name}
          </Button>
        ))}
        <Button
          onClick={() => setActiveGradeId('top')}
          role="tab"
          aria-selected={activeGradeId==='top'}
          variant={activeGradeId==='top' ? 'default' : 'outline'}
          className="h-9 px-3 text-sm"
        >
          <span className="sm:hidden" aria-label="TOP">🏆</span>
          <span className="hidden sm:inline">TOP</span>
        </Button>
        <Button
          onClick={() => router.push('/documents')}
          variant="outline"
          className="h-9 px-3 text-sm"
        >
          <span className="sm:hidden" aria-label="Tài liệu">📄</span>
          <span className="hidden sm:inline">TÀI LIỆU</span>
        </Button>
      </div>
      {activeGradeId !== 'top' ? (
        <div className="flex items-center">
          <Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Tìm bài theo tiêu đề..." />
        </div>
      ) : null}
      {activeGradeId === 'top' ? (
        <TopTab />
      ) : (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {filtered.map(ls => {
          const isExam = ls.lesson_type === 'exam'
          const totalBank = counts[ls.id] ?? 0
          const maxN = Math.min(50, totalBank)
          const defaultN = maxN <= 25 ? maxN : 25
          const selectedNRaw = questionCounts[ls.id]
          const selectedN = Math.max(1, Math.min(Number.isFinite(selectedNRaw as any) ? Number(selectedNRaw) : defaultN, maxN || 1))
          const cardCls = isExam
            ? 'border-orange-400/40 bg-orange-500/10 hover:border-orange-300/70'
            : 'border-green-400/40 bg-green-500/10 hover:border-green-300/70'
          const tagCls = isExam
            ? 'text-orange-100 bg-orange-600/20 border-orange-400/40'
            : 'text-green-100 bg-green-600/20 border-green-400/40'
          return (
            <Card
              key={ls.id}
              className={`relative overflow-hidden border cursor-pointer ${cardCls} transition-all duration-200 shadow-sm hover:shadow-xl hover:-translate-y-1`}
              onClick={() => {
                const lessonType = isExam ? 'exam' : 'practice'
                setStartLoading({ lesson_id: ls.id, lesson_type: lessonType })
                const href = lessonType === 'exam'
                  ? `/lesson/${ls.id}/quiz`
                  : `/lesson/${ls.id}/quiz?n=${selectedN}`
                setTimeout(() => router.push(href), 50)
              }}
            >
              <CardContent className="p-4 h-full flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <div className={`text-[11px] px-2.5 py-1 rounded-md border ${tagCls} bg-white/5`}>
                    {isExam ? 'Thi thử' : 'Luyện tập'}
                  </div>
                  {ls.is_teacher_recommended ? (
                    <div className="text-[11px] px-2.5 py-1 rounded-md border text-yellow-100 bg-yellow-600/20 border-yellow-400/40 bg-white/5">
                      Đề cử
                    </div>
                  ) : null}
                </div>

                <div className="space-y-1">
                  <div
                    className="text-[15px] font-semibold leading-snug"
                    style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden'
                    }}
                  >
                    {ls.title}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
                      {totalBank} câu
                    </div>
                    {!isExam ? (
                      <div className="flex items-center gap-2">
                        <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Số câu</div>
                        <input
                          type="number"
                          min={1}
                          max={maxN || 1}
                          disabled={maxN === 0}
                          value={selectedN}
                          onChange={e => {
                            const n = Math.max(1, Math.min(Number(e.target.value || 1), maxN || 1))
                            setQuestionCounts(m => ({ ...m, [ls.id]: n }))
                          }}
                          className="w-16 h-9 rounded-xl border border-[var(--divider)] bg-[var(--bg)] text-[var(--text)] px-2 text-[14px]"
                          aria-label="Chọn số câu luyện tập"
                          title={`Chọn số câu (tối đa ${maxN || 1})`}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-auto flex justify-center">
                  <button
                    className="text-sm px-4 py-2 rounded-md border border-slate-200/25 bg-white/10 hover:bg-white/20 transition disabled:opacity-50 disabled:pointer-events-none"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      const lessonType = isExam ? 'exam' : 'practice'
                      setStartLoading({ lesson_id: ls.id, lesson_type: lessonType })
                      const href = lessonType === 'exam'
                        ? `/lesson/${ls.id}/quiz`
                        : `/lesson/${ls.id}/quiz?n=${selectedN}`
                      setTimeout(() => router.push(href), 50)
                    }}
                    disabled={totalBank === 0}
                  >
                    Làm ▶
                  </button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
      )}
    </div>
  )
}
