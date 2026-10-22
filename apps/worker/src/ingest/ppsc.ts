import { createHash } from 'node:crypto'
import { parseHTML } from 'linkedom'
import type { SourceItemInput } from '../payload-client.js'
import { ZAVIYA_USER_AGENT } from './extract.js'
import { logger } from '../logger.js'

/**
 * PPSC jobs page as an ingest source (ZAV-86). PPSC publishes no feed, and Advertisement 11/2026 (9 Oct, 299 posts,
 * closing 26 Oct) never reached the pipeline: the aggregators' headlines were dropped by the 48 h age filter or sat
 * as headline-only Google News items. The official page lists every open case in one table, so each advertisement
 * becomes one source item whose text is the official list (post, department, fee, closing date).
 */
export const PPSC_HOST = 'ppsc.gop.pk'
export const PPSC_JOBS_URL = `https://${PPSC_HOST}/Jobs.aspx`

export function isPpscUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase()
    return h === PPSC_HOST || h.endsWith(`.${PPSC_HOST}`)
  } catch {
    return false
  }
}

export interface PpscCase {
  adNo: string
  caseNo: string
  post: string
  fee: string
  department: string
  adDate: string
  closingDate: string
}

/** "26-10-2026" -> ISO date at 00:00 Pakistan time (UTC+5), null when it is not a date */
export function parsePpscDate(s: string): string | null {
  const m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(s.trim())
  if (!m) return null
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const t = Date.UTC(y, mo - 1, d, -5, 0, 0)
  const back = new Date(t + 5 * 3_600_000)
  return back.getUTCDate() === d && back.getUTCMonth() === mo - 1 ? new Date(t).toISOString() : null
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
/** "26-10-2026" -> "26 October 2026" */
export function longDate(s: string): string {
  const m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(s.trim())
  return m ? `${Number(m[1])} ${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[3]}` : s
}

/** Reads the cases from the Jobs.aspx HTML. Throws when the table is not there, so a layout change is not silent. */
export function parsePpscJobs(html: string): PpscCase[] {
  const { document } = parseHTML(html)
  const table = document.querySelector('#ctl00_ContentPlaceHolder1_tbl_Jobs') ?? document.querySelector('table.tab_Jobs')
  if (!table) throw new Error('PPSC jobs table not found (page layout changed or the site blocked us)')
  const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()
  const out: PpscCase[] = []
  for (const tr of Array.from(table.querySelectorAll('tbody tr'))) {
    const td = Array.from(tr.querySelectorAll('td')).map((c) => clean(c.textContent))
    if (td.length < 8) continue
    out.push({ adNo: td[1]!, caseNo: td[2]!, post: td[3]!, fee: td[4]!, department: td[5]!, adDate: td[6]!, closingDate: td[7]! })
  }
  return out
}

const MAX_TEXT = 6000

/** One source item per advertisement that is still open. */
export function ppscToSourceItems(sourceId: string, cases: PpscCase[], now = Date.now()): { items: SourceItemInput[]; closed: string[] } {
  const byAd = new Map<string, PpscCase[]>()
  for (const c of cases) byAd.set(c.adNo, [...(byAd.get(c.adNo) ?? []), c])
  const items: SourceItemInput[] = []
  const closed: string[] = []
  for (const [adNo, rows] of byAd) {
    const closing = rows.map((r) => parsePpscDate(r.closingDate)).filter((x): x is string => x !== null)
    const last = closing.length ? Math.max(...closing.map((c) => Date.parse(c))) : NaN
    // closes at the end of the closing day
    if (Number.isFinite(last) && last + 24 * 3_600_000 < now) {
      closed.push(adNo)
      continue
    }
    const closingLabel = longDate(rows.find((r) => r.closingDate)?.closingDate ?? '')
    const adDate = rows[0]!.adDate
    const departments = [...new Set(rows.map((r) => r.department).filter(Boolean))]
    const title = `PPSC Advertisement No. ${adNo}: ${rows.length} ${rows.length === 1 ? 'case' : 'cases'} open for applications until ${closingLabel}`
    const lines = rows.map((r) => `- ${r.post} (case ${r.caseNo}; ${r.department}; fee Rs${r.fee}; closes ${longDate(r.closingDate)})`)
    const text = [
      `Official list from the Punjab Public Service Commission (ppsc.gop.pk). Advertisement No. ${adNo}, dated ${longDate(adDate)}, ${rows.length} ${rows.length === 1 ? 'case' : 'cases'} across ${departments.length} ${departments.length === 1 ? 'department' : 'departments'}. Applications are online only at ppsc.gop.pk; last date ${closingLabel}.`,
      '',
      ...lines,
    ].join('\n')
    const summary = `Punjab Public Service Commission lists ${rows.length} open ${rows.length === 1 ? 'case' : 'cases'} under advertisement ${adNo}; last date to apply is ${closingLabel}.`
    items.push({
      sourceId,
      // one item per advertisement for good, so the page is not re-posted on every poll
      externalId: `ppsc:ad:${adNo}`,
      url: `${PPSC_JOBS_URL}#ad-${adNo.replace('/', '-')}`,
      title,
      summary,
      contentText: text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) : text,
      // The advertisement is news for as long as it is open, so it is "published" when we first see it
      publishedAt: new Date(now).toISOString(),
      lang: 'en',
      hash: createHash('sha1').update(`${title}|${text}`).digest('hex'),
    })
  }
  return { items, closed }
}

export async function fetchPpscSourceItems(sourceId: string, url = PPSC_JOBS_URL, fetchFn: typeof fetch = fetch, now = Date.now()): Promise<SourceItemInput[]> {
  const res = await fetchFn(url, { headers: { 'User-Agent': ZAVIYA_USER_AGENT }, redirect: 'follow', signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`PPSC jobs page returned ${res.status}`)
  const cases = parsePpscJobs(await res.text())
  const { items, closed } = ppscToSourceItems(sourceId, cases, now)
  // ZAV-86: say what was found and what was left out, so a missing advertisement can be explained
  logger.info({ cases: cases.length, advertisements: items.map((i) => i.externalId), closed }, 'ppsc: jobs page read')
  if (!cases.length) logger.warn('ppsc: the jobs table is empty')
  return items
}

/** Sources the worker creates for itself when they are missing (the PPSC page has no feed to add by hand). */
export const BUILTIN_SOURCES = [
  {
    key: 'ppsc-jobs',
    name: 'PPSC (Punjab Public Service Commission) jobs',
    url: PPSC_JOBS_URL,
    type: 'rss' as const,
    trustTier: 1 as const,
    language: 'en',
    categoryHint: 'education-jobs',
    pollIntervalSec: 3600,
  },
]
