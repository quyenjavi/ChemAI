'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useRouter } from 'next/navigation'
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

export default function Dashboard() {
  const router = useRouter()
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
      const { data: { user } } = await supabaseBrowser.auth.getUser()
      if (!user?.id) return
      const { data: profile } = await supabaseBrowser
        .from('student_profiles')
        .select('grade_id')
        .eq('user_id', user.id)
        .maybeSingle()
      const gid = profile?.grade_id ? String(profile.grade_id) : null
      if (gid) setPreferredGradeId(gid)
    })()
  }, [])

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
    if (!activeGradeId) return
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
          >
            {g.name}
          </Button>
        ))}
      </div>
      <div className="flex items-center">
        <Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Tìm bài theo tiêu đề..." />
      </div>
      <div className="space-y-3">
        {filtered.map(ls => (
          <Card key={ls.id} className="border" style={{borderColor:'var(--divider)'}}>
            <CardContent className="p-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div
                      className={`text-xs px-2 py-1 rounded-md border ${
                        ls.lesson_type === 'exam'
                          ? 'text-purple-300 bg-purple-900/20 border-purple-500'
                          : 'text-blue-300 bg-blue-900/20 border-blue-400'
                      }`}
                    >
                      {ls.lesson_type === 'exam' ? 'Thi thử' : 'Luyện tập'}
                    </div>
                    {ls.is_teacher_recommended ? (
                      <div className="text-xs px-2 py-1 rounded-md border text-yellow-300 bg-yellow-900/20 border-yellow-400">
                        Đề cử
                      </div>
                    ) : null}
                    <CardTitle className="text-lg font-semibold truncate">{ls.title}</CardTitle>
                  </div>
                  {ls.description ? (
                    <div className="mt-2 text-sm text-gray-200/70 whitespace-pre-line">{ls.description}</div>
                  ) : null}
                  <div className="mt-2 text-sm text-gray-200/70">{counts[ls.id] ?? 0} câu hỏi</div>
                </div>

                <div className="flex flex-col items-start sm:items-end gap-3">
                  {ls.lesson_type === 'exam' ? null : (
                    <div className="flex items-center gap-3">
                      {(() => {
                        const maxBank = counts[ls.id] ?? 0
                        const max = Math.min(50, maxBank)
                        const disabled = max === 0
                        const val = questionCounts[ls.id] ?? (max || 1)
                        return (
                          <>
                            <label className="text-sm text-gray-200/70">Số câu</label>
                            <input
                              type="number"
                              min={1}
                              max={max || 1}
                              disabled={disabled}
                              value={val}
                              onChange={e => {
                                const n = Math.max(1, Math.min(Number(e.target.value || 1), max || 1))
                                setQuestionCounts(m => ({ ...m, [ls.id]: n }))
                              }}
                              className="w-24 min-h-12 rounded-md border border-[var(--divider)] bg-[var(--bg)] text-[var(--text)] px-3"
                              aria-label="Chọn số câu hỏi"
                              title={`Chọn số câu (tối đa ${max})`}
                            />
                          </>
                        )
                      })()}
                    </div>
                  )}
                  <Button
                    className="w-full sm:w-auto min-w-24 whitespace-nowrap bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 shrink-0"
                    disabled={(counts[ls.id] ?? 0) === 0}
                    onClick={() => {
                      const lessonType = ls.lesson_type === 'exam' ? 'exam' : 'practice'
                      setStartLoading({ lesson_id: ls.id, lesson_type: lessonType })
                      const href = lessonType === 'exam'
                        ? `/lesson/${ls.id}/quiz`
                        : `/lesson/${ls.id}/quiz?n=${questionCounts[ls.id] ?? (Math.min(50, counts[ls.id] ?? 0) || 1)}`
                      setTimeout(() => router.push(href), 50)
                    }}
                  >
                    {ls.lesson_type === 'exam' ? 'Bắt đầu' : 'Làm bài'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
