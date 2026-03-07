'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
type Grade = { id: string, name: string }
type Lesson = { id: string, grade_id: string, title: string, description: string | null }

export default function Dashboard() {
  const [grades, setGrades] = useState<Grade[]>([])
  const [activeGradeId, setActiveGradeId] = useState<string | null>(null)
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [search, setSearch] = useState('')
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [questionCounts, setQuestionCounts] = useState<Record<string, number>>({})
  const [slogan, setSlogan] = useState('')
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    if (!s) return lessons
    return lessons.filter(l => l.title.toLowerCase().includes(s))
  }, [search, lessons])

  useEffect(() => {
    supabaseBrowser.from('grades').select('*').order('created_at', { ascending: true }).then(({ data }) => {
      if (data && data.length) {
        setGrades(data as any)
        setActiveGradeId(data[0].id)
      }
    })
  }, [])

  useEffect(() => {
    if (!activeGradeId) return
    supabaseBrowser
      .from('lessons')
      .select('id, grade_id, title, description')
      .eq('grade_id', activeGradeId)
      .order('created_at', { ascending: true })
      .then(async ({ data }) => {
        const list = (data || []) as any as Lesson[]
        setLessons(list)
        // fetch counts via internal API to avoid cross-origin REST aborts
        const entries = await Promise.all(list.map(async (ls) => {
          const res = await fetch(`/api/lessons/${ls.id}/questions`)
          const arr = res.ok ? await res.json() : []
          return [ls.id, (arr || []).length] as const
        }))
        setCounts(Object.fromEntries(entries))
      })
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

  return (
    <div className="space-y-10">
      <h1 className="text-[32px] font-semibold">Chọn bài luyện tập</h1>
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filtered.map(ls => (
          <Card key={ls.id} className="hover:shadow-[0_10px_30px_rgba(0,0,0,0.45)] transition">
            <CardHeader>
              <CardTitle>{ls.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-[15px]" style={{color:'var(--text-secondary)'}}>{ls.description}</p>
              <div className="text-[14px] mt-2" style={{color:'var(--text-muted)'}}>{counts[ls.id] ?? 0} câu hỏi</div>
              <div className="mt-2 flex items-center gap-2">
                {(() => {
                  const maxBank = counts[ls.id] ?? 0
                  const max = Math.min(30, maxBank)
                  const disabled = max === 0
                  const val = questionCounts[ls.id] ?? Math.min(10, Math.max(1, max))
                  return (
                    <>
                      <label className="text-[14px]" style={{color:'var(--text-muted)'}}>Số câu:</label>
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
                        className="w-24 h-10 rounded-md border border-[var(--divider)] bg-[var(--bg)] text-[var(--text)] px-3"
                        aria-label="Chọn số câu hỏi"
                        title={`Chọn số câu (tối đa ${max})`}
                      />
                    </>
                  )
                })()}
              </div>
              <div className="mt-3">
                <a href={`/lesson/${ls.id}/quiz?n=${questionCounts[ls.id] ?? Math.min(10, Math.max(1, Math.min(30, counts[ls.id] ?? 0)))}`}>
                  <Button size="md" disabled={(counts[ls.id] ?? 0) === 0}>Làm bài</Button>
                </a>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
