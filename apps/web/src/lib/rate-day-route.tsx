import { notFound } from 'next/navigation'
import { RateDayPage, RateHistoryPage } from '@/components/data/RateDayPage'
import { englishOnly } from '@/lib/english-only'
import { parseLocale } from '@/lib/locale'
import { dayDescription, dayTitle, isRateDate, rateDayPath, rateFamilyBySlug, rateHistoryPath } from '@/lib/rate-history'
import { getRateDay, getRateDays } from '@/lib/rate-history-data'
import { buildPageMetadata } from '@/lib/seo'

/** Shared by the three /<rate page>/<date> routes. Unknown dates and days without data are 404 (no empty pages). */
export async function rateDayMetadata(slug: string, p: { locale: string; date: string }) {
  const family = rateFamilyBySlug(slug)
  if (!family || !isRateDate(p.date)) return {}
  const rows = await getRateDay(family, p.date)
  if (!rows.length) return {}
  return buildPageMetadata({
    locale: 'en',
    title: dayTitle(family, p.date, rows),
    description: dayDescription(family, p.date, rows),
    enPath: rateDayPath(family, p.date),
  })
}

export async function renderRateDayPage(slug: string, p: { locale: string; date: string }) {
  const family = rateFamilyBySlug(slug)
  if (!family || !isRateDate(p.date)) notFound()
  englishOnly(parseLocale(p.locale), rateDayPath(family, p.date))
  const [rows, days] = await Promise.all([getRateDay(family, p.date), getRateDays(family)])
  if (!rows.length) notFound()
  const prev = days.map((d) => d.date).find((d) => d < p.date)
  const previousRows = prev ? await getRateDay(family, prev) : []
  return <RateDayPage family={family} date={p.date} rows={rows} days={days} previousRows={previousRows} />
}

export async function rateHistoryMetadata(slug: string, p: { locale: string }) {
  const family = rateFamilyBySlug(slug)
  if (!family) return {}
  return buildPageMetadata({
    locale: 'en',
    title: `${family.noun} history in Pakistan: day by day`,
    description: `Every day Zaviya News has recorded the ${family.noun.toLowerCase()} in Pakistan, newest first.`,
    enPath: rateHistoryPath(family),
  })
}

export async function renderRateHistoryPage(slug: string, p: { locale: string }) {
  const family = rateFamilyBySlug(slug)
  if (!family) notFound()
  englishOnly(parseLocale(p.locale), rateHistoryPath(family))
  return <RateHistoryPage family={family} days={await getRateDays(family)} />
}
