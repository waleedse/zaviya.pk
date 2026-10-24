import type { Mailer, OutgoingMail } from '../mail/transport.js'
import type { Kv } from '../mail/kv.js'
import { logger } from '../logger.js'

/**
 * ZAV-109 phase 2: the confirmation mail (double opt-in) and the "Zaviya Morning Briefing".
 * The subscriber table lives in the web app's database; this reads and marks rows through /api/pipeline/newsletter/*.
 * Everything is inert unless NEWSLETTER_SEND=true and the news@ login is set (see queues.ts).
 */

export const SEND_PER_HOUR = 200
/** The briefing goes out from 07:30 Pakistan time; anyone not reached by 11:30 waits for tomorrow rather than getting stale news */
export const BRIEFING_FROM_MIN = 7 * 60 + 30
export const BRIEFING_UNTIL_MIN = 11 * 60 + 30
const BATCH = 25
const MAX_TRIES = 3

export interface Row {
  id: number
  email: string
  locale: string
  token: string
}
export interface Story {
  id: number
  category: string
  slugEn: string
  titleEn: string
  dekEn: string | null
  slugUr: string | null
  titleUr: string | null
  dekUr: string | null
}

export interface NewsletterDeps {
  /** PayloadClient.request */
  request: <T>(method: string, path: string, body?: unknown) => Promise<T>
  mailer: Mailer
  kv: Kv
  site: string
  now?: () => Date
}

export function karachiNow(now: Date): { day: string; minutes: number; hourKey: string; weekday: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'long' })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>
  const hour = Number(parts.hour) % 24
  return { day: `${parts.year}-${parts.month}-${parts.day}`, minutes: hour * 60 + Number(parts.minute), hourKey: `${parts.year}${parts.month}${parts.day}${String(hour).padStart(2, '0')}`, weekday: parts.weekday! }
}

const FROM_NAME = 'Zaviya News'
const isUr = (r: Row) => r.locale === 'ur'
const unsubscribeUrl = (site: string, r: Row) => `${site}/api/newsletter/unsubscribe?token=${encodeURIComponent(r.token)}${isUr(r) ? '&lang=ur' : ''}`

export function confirmMail(r: Row, site: string): OutgoingMail {
  const link = `${site}/api/newsletter/confirm?token=${encodeURIComponent(r.token)}${isUr(r) ? '&lang=ur' : ''}`
  const body = isUr(r)
    ? `آپ نے زاویہ کی صبح کی بریفنگ کے لیے سائن اپ کیا تھا۔ تصدیق کے لیے یہ لنک کھولیں:\n\n${link}\n\nاگر یہ آپ نے نہیں کیا تو اس ای میل کو نظر انداز کر دیں، کچھ نہیں بھیجا جائے گا۔\n\nزاویہ | zaviya.pk`
    : `You asked for the Zaviya Morning Briefing: the five stories that matter to Pakistan, every morning at 7:30.\n\nConfirm your address:\n${link}\n\nIf this was not you, ignore this email and nothing will be sent.\n\nZaviya | zaviya.pk`
  return { to: r.email, subject: isUr(r) ? 'اپنی زاویہ بریفنگ کی تصدیق کریں' : 'Confirm your Zaviya Morning Briefing', body, bulk: { fromName: FROM_NAME, headers: {} } }
}

const utm = 'utm_source=newsletter&utm_medium=email&utm_campaign=morning-briefing'
const clip = (s: string | null, n: number) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t
}

export function briefingMail(r: Row, stories: Story[], site: string, dateLabel: string): OutgoingMail {
  const ur = isUr(r)
  const items = stories.map((s, i) => {
    const useUr = ur && s.titleUr && s.slugUr
    const title = useUr ? s.titleUr! : s.titleEn
    const dek = useUr ? s.dekUr : s.dekEn
    const url = `${site}${useUr ? '/ur' : ''}/${s.category}/${useUr ? s.slugUr : s.slugEn}?${utm}`
    return `${i + 1}. ${title}\n${clip(dek, 200)}\n${url}`
  })
  const unsub = unsubscribeUrl(site, r)
  const body = ur
    ? `زاویہ کی صبح کی بریفنگ | ${dateLabel}\n\n${items.join('\n\n')}\n\nمزید خبریں: ${site}/ur?${utm}\n\n--\nآپ کو یہ ای میل اس لیے ملی کہ آپ نے zaviya.pk پر سائن اپ کیا تھا۔ ایک کلک میں اَن سبسکرائب کریں:\n${unsub}`
    : `Zaviya Morning Briefing | ${dateLabel}\n\n${items.join('\n\n')}\n\nMore news: ${site}/?${utm}\n\n--\nYou get this because you signed up at zaviya.pk. Unsubscribe in one click:\n${unsub}`
  return {
    to: r.email,
    subject: ur ? `زاویہ صبح کی بریفنگ: ${clip(stories[0]?.titleUr ?? stories[0]?.titleEn ?? '', 70)}` : `Zaviya Morning Briefing: ${clip(stories[0]?.titleEn ?? '', 70)}`,
    body,
    bulk: { fromName: FROM_NAME, headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click', Precedence: 'bulk' } },
  }
}

async function failures(kv: Kv, key: string): Promise<number> {
  return Number((await kv.get(key)) ?? 0)
}
async function noteFailure(kv: Kv, key: string): Promise<number> {
  const n = (await failures(kv, key)) + 1
  await kv.set(key, String(n), 3 * 24 * 3600)
  return n
}

/** Hourly budget (200 mails an hour for both kinds), counted in Redis per Karachi hour. */
export interface Budget {
  readonly left: number
  spend(): Promise<void>
}
export async function hourlyBudget(kv: Kv, hourKey: string): Promise<Budget> {
  const key = `newsletter:sent:${hourKey}`
  let used = Number((await kv.get(key)) ?? 0)
  return {
    get left() {
      return Math.max(0, SEND_PER_HOUR - used)
    },
    async spend() {
      used++
      await kv.set(key, String(used), 2 * 3600)
    },
  }
}

export async function sendConfirmations(deps: NewsletterDeps, b: Budget): Promise<{ sent: number; failed: number }> {
  let sent = 0
  let failed = 0
  while (b.left > 0) {
    const { rows } = await deps.request<{ rows: Row[] }>('GET', `/api/pipeline/newsletter/pending?limit=${Math.min(BATCH, b.left)}`)
    if (!rows.length) break
    const done: number[] = []
    for (const r of rows) {
      if (b.left <= 0) break
      const key = `newsletter:confirm-fail:${r.id}`
      try {
        await deps.mailer.send(confirmMail(r, deps.site))
        await b.spend()
        done.push(r.id)
        sent++
      } catch (e) {
        failed++
        const n = await noteFailure(deps.kv, key)
        logger.warn({ err: e instanceof Error ? e.message : e, subscriber: r.id, tries: n }, 'newsletter: confirmation mail failed')
        // A permanently bad address is marked as done after MAX_TRIES so it is not retried forever
        if (n >= MAX_TRIES) done.push(r.id)
      }
    }
    if (done.length) await deps.request('POST', '/api/pipeline/newsletter/confirm-sent', { ids: done })
    if (rows.length < BATCH || failed >= MAX_TRIES * 2) break
    if (!done.length) break
  }
  return { sent, failed }
}

export async function sendBriefing(
  deps: NewsletterDeps,
  b: Budget,
  day: string,
  dateLabel: string,
): Promise<{ sent: number; failed: number; skipped?: string }> {
  let sent = 0
  let failed = 0
  while (b.left > 0) {
    const { stories, rows } = await deps.request<{ stories: Story[]; rows: Row[] }>('GET', `/api/pipeline/newsletter/briefing?day=${day}&limit=${Math.min(BATCH, b.left)}`)
    if (!rows.length) break
    if (stories.length < 3) return { sent, failed, skipped: `only ${stories.length} fresh stories` }
    const done: number[] = []
    let skippedBad = 0
    for (const r of rows) {
      if (b.left <= 0) break
      const key = `newsletter:brief-fail:${day}:${r.id}`
      if ((await failures(deps.kv, key)) >= MAX_TRIES) {
        skippedBad++
        done.push(r.id) // give up on this address for today (marked so it does not block the batch)
        continue
      }
      try {
        await deps.mailer.send(briefingMail(r, stories, deps.site, dateLabel))
        await b.spend()
        done.push(r.id)
        sent++
      } catch (e) {
        failed++
        const n = await noteFailure(deps.kv, key)
        logger.warn({ err: e instanceof Error ? e.message : e, subscriber: r.id, tries: n }, 'newsletter: briefing mail failed')
      }
    }
    if (done.length) await deps.request('POST', '/api/pipeline/newsletter/briefed', { ids: done, day })
    if (rows.length < BATCH && !skippedBad) break
    if (!done.length || failed >= MAX_TRIES * 2) break
  }
  return { sent, failed }
}

/** One scheduled run (every 10 minutes): confirmations first, then the briefing inside its window. */
export async function runNewsletter(deps: NewsletterDeps): Promise<Record<string, unknown>> {
  const now = (deps.now ?? (() => new Date()))()
  const k = karachiNow(now)
  const b = await hourlyBudget(deps.kv, k.hourKey)
  const confirmations = await sendConfirmations(deps, b)
  let briefing: Record<string, unknown> | undefined
  if (k.minutes >= BRIEFING_FROM_MIN && k.minutes < BRIEFING_UNTIL_MIN) {
    const dateLabel = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', weekday: 'long', day: 'numeric', month: 'long' }).format(now)
    briefing = await sendBriefing(deps, b, k.day, dateLabel)
  }
  if (confirmations.sent || confirmations.failed || (briefing && (briefing.sent || briefing.failed || briefing.skipped))) {
    logger.info({ confirmations, briefing, day: k.day }, 'newsletter run')
  }
  return { confirmations, briefing }
}
