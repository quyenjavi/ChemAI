'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type Doc = {
  id: string
  grade_id: string
  grade_name: string
  title: string
  description: string
  document_type: string
  file_url: string
  thumbnail_url: string
  sort_order: number
  created_at: string
}

const typeMap: Record<string, { label: string, icon: string }> = {
  'slide': { label: 'Slide', icon: '📊' },
  'cam-nang': { label: 'Cẩm nang', icon: '📘' },
  'mindmap': { label: 'Mindmap', icon: '🧠' },
  'tom-tat': { label: 'Tóm tắt', icon: '📝' },
  'tai-lieu': { label: 'Tài liệu', icon: '📄' }
}

type GradeColor = 'purple' | 'green' | 'orange' | 'default'

function detectGradeColor(gradeName: string): GradeColor {
  const s = String(gradeName || '').trim()
  if (s === 'Khối 10') return 'purple'
  if (s === 'Khối 11') return 'green'
  if (s === 'Khối 12') return 'orange'
  const m = s.match(/\d+/)
  const n = m ? Number(m[0]) : NaN
  if (n === 10) return 'purple'
  if (n === 11) return 'green'
  if (n === 12) return 'orange'
  return 'default'
}

const gradeStyles: Record<GradeColor, { card: string, gradeTag: string, hover: string }> = {
  purple: {
    card: 'border-purple-400/40 bg-purple-500/10',
    gradeTag: 'bg-purple-600/20 border-purple-400/40 text-purple-100',
    hover: 'hover:border-purple-300/70'
  },
  green: {
    card: 'border-green-400/40 bg-green-500/10',
    gradeTag: 'bg-green-600/20 border-green-400/40 text-green-100',
    hover: 'hover:border-green-300/70'
  },
  orange: {
    card: 'border-orange-400/40 bg-orange-500/10',
    gradeTag: 'bg-orange-600/20 border-orange-400/40 text-orange-100',
    hover: 'hover:border-orange-300/70'
  },
  default: {
    card: 'border-slate-200/20 bg-slate-900/40',
    gradeTag: 'bg-slate-800/40 border-slate-200/20 text-slate-100',
    hover: 'hover:border-slate-200/40'
  }
}

function normalizeFileUrl(url: string) {
  const s = String(url || '').trim()
  if (!s) return ''
  if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('/')) return s
  return `/${s}`
}

export default function DocumentsGrid({ documents, preferredGradeId }: { documents: Doc[], preferredGradeId: string | null }) {
  const router = useRouter()

  const sorted = useMemo(() => {
    const arr = [...(documents || [])]
    arr.sort((a, b) => {
      if (preferredGradeId) {
        if (a.grade_id === preferredGradeId && b.grade_id !== preferredGradeId) return -1
        if (b.grade_id === preferredGradeId && a.grade_id !== preferredGradeId) return 1
      }
      if ((a.sort_order ?? 0) !== (b.sort_order ?? 0)) return (a.sort_order ?? 0) - (b.sort_order ?? 0)
      const ta = a.created_at ? Date.parse(a.created_at) : 0
      const tb = b.created_at ? Date.parse(b.created_at) : 0
      if (ta !== tb) return tb - ta
      return String(a.title || '').localeCompare(String(b.title || ''))
    })
    return arr
  }, [documents, preferredGradeId])

  if (!sorted.length) {
    return (
      <Card className="border" style={{borderColor:'var(--divider)'}}>
        <CardContent className="p-6">
          <div className="text-sm" style={{color:'var(--text-muted)'}}>Chưa có tài liệu hiển thị.</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="container-grid">
      <style jsx>{`
        .container-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 24px;
          align-items: stretch;
        }
        .doc-card {
          height: 100%;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .doc-card-content {
          flex-grow: 1;
          display: flex;
          flex-direction: column;
        }
        .doc-description {
          min-height: 48px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .doc-btn {
          margin-top: auto;
        }
      `}</style>
      {sorted.map((item) => {
        const colorKey = detectGradeColor(item.grade_name)
        const styles = gradeStyles[colorKey]
        const gradeTag = `[${String(item.grade_name || '').replace('Khối ', '') || '—'}]`
        const t = typeMap[item.document_type] || { label: (item.document_type || 'Tài liệu'), icon: '📄' }
        const fileUrl = normalizeFileUrl(item.file_url)

        return (
          <div key={item.id}>
            <Card
              className={`doc-card border cursor-pointer ${styles.card} ${styles.hover} transition-all duration-200 shadow-sm hover:shadow-xl hover:-translate-y-1`}
              onClick={() => router.push(`/documents/${item.id}`)}
            >
              <CardHeader className="p-6 pb-3 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs px-2.5 py-1 rounded-md border ${styles.gradeTag} bg-white/5`}>{gradeTag}</span>
                  <span className="text-xs px-2.5 py-1 rounded-md border bg-white/5 border-slate-200/20 text-slate-100">
                    <span className="inline-flex items-center gap-2">
                      <span>{t.icon}</span>
                      <span>{t.label}</span>
                    </span>
                  </span>
                </div>
                <CardTitle className="text-[18px] sm:text-[20px] font-semibold leading-snug">{item.title || '—'}</CardTitle>
              </CardHeader>
              <CardContent className="doc-card-content px-6 pb-6 pt-0 space-y-4">
                {item.thumbnail_url ? (
                  <img
                    src={item.thumbnail_url}
                    alt={item.title || 'thumbnail'}
                    className="w-full h-40 object-cover rounded-lg border"
                    style={{borderColor:'var(--divider)'}}
                  />
                ) : null}
                {item.description ? (
                  <p className="doc-description text-sm whitespace-pre-line text-slate-200/80">{item.description}</p>
                ) : (
                  <p className="doc-description text-sm text-slate-200/70">Xem tài liệu</p>
                )}
                <button
                  className="doc-btn w-full text-sm px-4 py-2.5 rounded-md border border-slate-200/25 bg-white/10 hover:bg-white/20 transition"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    if (!fileUrl) return
                    window.open(fileUrl, '_blank')
                  }}
                >
                  Xem tài liệu
                </button>
              </CardContent>
            </Card>
          </div>
        )
      })}
    </div>
  )
}
