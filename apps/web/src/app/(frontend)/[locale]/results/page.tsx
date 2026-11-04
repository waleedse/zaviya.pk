import { ResultsHub } from '@/components/results/ResultPages'
import { englishOnly } from '@/lib/english-only'
import { parseLocale } from '@/lib/locale'
import { getLatestLinks } from '@/lib/queries'
import { resultsPath } from '@/lib/result-boards'
import { resultYear } from '@/lib/results-content'
import { getBoards, getExams } from '@/lib/results-data'
import { buildPageMetadata } from '@/lib/seo'

export const revalidate = 300

type Props = { params: Promise<{ locale: string }> }

export async function generateMetadata() {
  const year = resultYear()
  return buildPageMetadata({
    locale: 'en',
    title: `Board Results ${year} Pakistan: BISE, FBISE, BSEK, BIEK Dates and Links`,
    description: `Result dates, official links and roll number or SMS checks for every Pakistani board: Punjab, Sindh, KP, Balochistan, AJK, FBISE, BSEK and BIEK.`,
    enPath: resultsPath(),
    absoluteTitle: true,
  })
}

export default async function Page({ params }: Props) {
  englishOnly(parseLocale((await params).locale), resultsPath())
  const [boards, exams, latest] = await Promise.all([getBoards(), getExams(), getLatestLinks('en', 'education-jobs', 1, 8).catch(() => null)])
  return <ResultsHub boards={boards} exams={exams} year={resultYear()} latest={latest?.docs ?? []} />
}
