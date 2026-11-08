/**
 * Prize bond draw results, read from the official National Savings lists (savings.gov.pk publishes every draw as a
 * .txt file on its denomination page). Nothing is copied from other sites. Pages show the source link, and the
 * lists are cached (fetch revalidate), so savings.gov.pk sees a few requests an hour at most.
 */

export const RESULT_DENOMINATIONS = [100, 200, 750, 1500] as const
export type ResultDenomination = (typeof RESULT_DENOMINATIONS)[number]

const SOURCE_PAGE = (d: ResultDenomination) => `https://savings.gov.pk/rs-${d}-prize-bond-draw/`
const UA = { 'user-agent': 'ZaviyaBot/1.0 (https://zaviya.pk; ops@zaviya.pk)' }
/** Draws kept per denomination: about three years (four draws a year) */
const MAX_DRAWS = 12

export interface DrawLink {
  /** ISO date of the draw, from the link text on the official page */
  date: string
  url: string
}

export interface PrizeTier {
  /** 1 = first prize */
  rank: number
  amount: number | null
  numbers: string[]
}

export interface DrawResult {
  denomination: ResultDenomination
  date: string
  drawNo: number | null
  tiers: PrizeTier[]
  sourceUrl: string
}

export const denominationSlug = (d: number) => `rs-${d}`
export function denominationFromSlug(slug: string): ResultDenomination | null {
  const n = Number(/^rs-(\d+)$/.exec(slug)?.[1])
  return (RESULT_DENOMINATIONS as readonly number[]).includes(n) ? (n as ResultDenomination) : null
}

/** .txt draw lists on an official denomination page, newest first, one per date */
export function parseDrawLinks(html: string): DrawLink[] {
  const out = new Map<string, DrawLink>()
  const re = /<a[^>]+href="(https?:\/\/(?:www\.)?savings\.gov\.pk\/wp-content\/uploads\/[^"]+\.txt)"[^>]*>([^<]*)/gi
  for (const m of html.matchAll(re)) {
    const d = /(\d{1,2})-(\d{1,2})-(20\d\d)/.exec(m[2] ?? '')
    if (!d) continue
    const date = `${d[3]}-${d[2]!.padStart(2, '0')}-${d[1]!.padStart(2, '0')}`
    if (!out.has(date)) out.set(date, { date, url: m[1]! })
  }
  return [...out.values()].sort((a, b) => b.date.localeCompare(a.date))
}

const amountOf = (line: string): number | null => {
  const m = /Rs\.?\s*([\d][\d,\s]*)/i.exec(line)
  if (!m) return null
  const n = Number(m[1]!.replace(/[\s,]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * One official .txt list. The files differ by year and denomination ("First Prize of Rs. 3,000,000/-",
 * "1st Prize: Rs. 750,000/-", "(2400 Prizes of Rs.1250/- Each)"), so a prize heading is any line naming a prize
 * with an Rs amount, and the numbers under it are its six-digit tokens.
 */
export function parseDrawText(text: string, denomination: ResultDenomination, date: string, sourceUrl: string): DrawResult | null {
  const tiers: PrizeTier[] = []
  let drawNo: number | null = null
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trim()
    if (!line) continue
    if (drawNo === null) {
      const d = /(\d{2,3})\s*(?:st|nd|rd|th)?\s*draw/i.exec(line) ?? /draw\s*(?:no\.?)?\s*(\d{2,3})\b/i.exec(line)
      if (d && /draw/i.test(line) && !/prize of/i.test(line)) drawNo = Number(d[1])
    }
    if (/prize/i.test(line) && /Rs/i.test(line)) {
      tiers.push({ rank: tiers.length + 1, amount: amountOf(line), numbers: [] })
      continue
    }
    const tier = tiers[tiers.length - 1]
    if (!tier) continue
    for (const n of line.match(/(?<![\d,.-])\d{6}(?![\d,.-])/g) ?? []) tier.numbers.push(n)
  }
  const kept = tiers.filter((t) => t.numbers.length > 0).map((t, i) => ({ ...t, rank: i + 1 }))
  // a real list has a first prize and hundreds of third prizes
  if (kept.length < 2 || kept.reduce((s, t) => s + t.numbers.length, 0) < 50) return null
  return { denomination, date, drawNo, tiers: kept, sourceUrl }
}

async function fetchText(url: string, revalidate: number): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: UA, next: { revalidate }, signal: AbortSignal.timeout(15_000) })
    return res.ok ? await res.text() : null
  } catch {
    return null
  }
}

/** Official draw dates for a denomination, newest first */
export async function getDrawLinks(d: ResultDenomination): Promise<DrawLink[]> {
  const html = await fetchText(SOURCE_PAGE(d), 3600)
  return html ? parseDrawLinks(html).slice(0, MAX_DRAWS) : []
}

export async function getDraw(d: ResultDenomination, link: DrawLink): Promise<DrawResult | null> {
  // a published list never changes
  const text = await fetchText(link.url, 7 * 86_400)
  return text ? parseDrawText(text, d, link.date, link.url) : null
}

export async function getDraws(d: ResultDenomination, max = MAX_DRAWS): Promise<DrawResult[]> {
  const links = (await getDrawLinks(d)).slice(0, max)
  const draws = await Promise.all(links.map((l) => getDraw(d, l)))
  return draws.filter((x): x is DrawResult => x !== null)
}

/** "123456, 234567 / 345600-345650" -> unique six-digit numbers (ranges up to 1,000 numbers) */
export function parseBondInput(input: string, max = 1000): string[] {
  const out = new Set<string>()
  for (const part of input.split(/[\s,;/]+/)) {
    const range = /^(\d{1,6})-(\d{1,6})$/.exec(part)
    if (range) {
      const a = Number(range[1])
      const b = Number(range[2])
      for (let n = Math.min(a, b); n <= Math.max(a, b) && out.size < max; n++) out.add(String(n).padStart(6, '0'))
    } else if (/^\d{1,6}$/.test(part)) out.add(part.padStart(6, '0'))
    if (out.size >= max) break
  }
  return [...out]
}

export interface Win {
  number: string
  date: string
  drawNo: number | null
  rank: number
  amount: number | null
}

export function findWins(numbers: string[], draws: DrawResult[]): Win[] {
  const wanted = new Set(numbers)
  const wins: Win[] = []
  for (const draw of draws) {
    for (const tier of draw.tiers) {
      for (const n of tier.numbers) if (wanted.has(n)) wins.push({ number: n, date: draw.date, drawNo: draw.drawNo, rank: tier.rank, amount: tier.amount })
    }
  }
  return wins.sort((a, b) => b.date.localeCompare(a.date) || a.rank - b.rank)
}

export const rankLabel = (rank: number) => (rank === 1 ? 'First prize' : rank === 2 ? 'Second prize' : rank === 3 ? 'Third prize' : `Prize ${rank}`)
