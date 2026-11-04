import { notFound } from 'next/navigation'
import { BoardPage } from '@/components/results/ResultPages'
import { englishOnly } from '@/lib/english-only'
import { parseLocale } from '@/lib/locale'
import { boardDefBySlug, boardPath } from '@/lib/result-boards'
import { resultYear } from '@/lib/results-content'
import { getBoard, getBoardNews, getBoards, getExams } from '@/lib/results-data'
import { buildPageMetadata } from '@/lib/seo'

export const revalidate = 300

export async function generateStaticParams() {
  return []
}

type Props = { params: Promise<{ locale: string; board: string }> }

export async function generateMetadata({ params }: Props) {
  const def = boardDefBySlug((await params).board)
  if (!def) return {}
  const year = resultYear()
  return buildPageMetadata({
    locale: 'en',
    title: `${def.name} Result ${year}: Date, Roll Number and SMS Check`,
    description: `${def.name} result ${year}: official link, result date for class 9, 10, 11 and 12 with its source, roll number and SMS check, gazette and position holders.`,
    enPath: boardPath(def.slug),
  })
}

export default async function Page({ params }: Props) {
  const p = await params
  const def = boardDefBySlug(p.board)
  if (!def) notFound()
  englishOnly(parseLocale(p.locale), boardPath(def.slug))
  const [board, boards, exams, news] = await Promise.all([getBoard(def.slug), getBoards(), getExams(), getBoardNews(def.slug)])
  if (!board) notFound()
  return <BoardPage board={board} exams={exams.filter((e) => e.boardSlug === def.slug)} year={resultYear()} news={news} siblings={boards} />
}
