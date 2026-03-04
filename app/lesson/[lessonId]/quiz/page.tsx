import QuizClient from './quiz-client'

export default function QuizPage({ params, searchParams }: { params: { lessonId: string }, searchParams: { n?: string } }) {
  const lessonId = params?.lessonId
  const n = searchParams?.n || ''
  return <QuizClient lessonId={lessonId} n={n} />
}
