import { notFound } from 'next/navigation'
import { ClassPage } from '@/components/results/ResultPages'
import { englishOnly } from '@/lib/english-only'
import { parseLocale } from '@/lib/locale'
import { boardDefBySlug, classPath, parseClassSegment } from '@/lib/result-boards'
import { resultYear } from '@/lib/results-content'
import { getBoard, getBoardNews, getExams } from '@/lib/results-data'
import { buildPageMetadata } from '@/lib/seo'

export const revalidate = 300

export async function generateStaticParams() {
  return []
}

type Props = { params: Promise<{ locale: string; board: string; cls: string }> }

function resolve(p: { board: string; cls: string }) {
  const def = boardDefBySlug(p.board)
  const c = parseClassSegment(p.cls)
  return def && c && def.classes.includes(c) ? { def, c } : null
}

export async function generateMetadata({ params }: Props) {
  const r = resolve(await params)
  if (!r) return {}
  const year = resultYear()
  return buildPageMetadata({
    locale: 'en',
    title: `${r.def.name} Class ${r.c} Result ${year}: Date and How to Check`,
    description: `${r.def.name} class ${r.c} result ${year}: the date with its source, the official link, and how to check by roll number.`,
    enPath: classPath(r.def.slug, r.c),
  })
}

export default async function Page({ params }: Props) {
  const p = await params
  const r = resolve(p)
  if (!r) notFound()
  englishOnly(parseLocale(p.locale), classPath(r.def.slug, r.c))
  const [board, exams, news] = await Promise.all([getBoard(r.def.slug), getExams(), getBoardNews(r.def.slug)])
  if (!board) notFound()
  return <ClassPage board={board} classLevel={r.c} exams={exams.filter((e) => e.boardSlug === r.def.slug)} year={resultYear()} news={news} />
}
