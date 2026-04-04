'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

export default function GradeExamButton({ examId }: { examId: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const grade = async () => {
    setLoading(true)
    setError('')
    const r = await fetch(`/api/teacher/official-exams/${examId}/grade`, {
      method: 'POST',
      credentials: 'include',
    })
    const j = await r.json().catch(() => ({}))
    setLoading(false)
    if (!r.ok) {
      setError(j.error || 'Grade failed')
      return
    }
    window.location.reload()
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={grade} disabled={loading} variant="outline" className="h-8 px-3 text-sm">
        {loading ? 'Đang chấm...' : 'Grade Exam'}
      </Button>
      {error ? <div className="text-xs text-red-500">{error}</div> : null}
    </div>
  )
}

