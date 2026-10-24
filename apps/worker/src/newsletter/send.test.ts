import { describe, expect, it, vi } from 'vitest'
import { briefingMail, confirmMail, karachiNow, runNewsletter, SEND_PER_HOUR, type Row, type Story } from './send.js'
import { memoryKv } from '../mail/kv.js'
import { buildMessage, type OutgoingMail } from '../mail/transport.js'

const story = (n: number): Story => ({ id: n, category: 'pakistan', slugEn: `story-${n}`, titleEn: `Story ${n} headline`, dekEn: `Dek ${n}`, slugUr: `kahani-${n}`, titleUr: `کہانی ${n}`, dekUr: `خلاصہ ${n}` })
const rows = (from: number, n: number, locale = 'en'): Row[] => Array.from({ length: n }, (_, i) => ({ id: from + i, email: `p${from + i}@example.com`, locale, token: `tok${from + i}` }))

function fake(state: { pending: Row[]; active: Row[]; stories: Story[] }) {
  const calls: { method: string; path: string; body?: unknown }[] = []
  const sent: OutgoingMail[] = []
  const request = vi.fn(async (method: string, path: string, body?: unknown) => {
    calls.push({ method, path, body })
    if (path.startsWith('/api/pipeline/newsletter/pending')) return { rows: state.pending.slice(0, Number(new URL(`http://x${path}`).searchParams.get('limit'))) }
    if (path.startsWith('/api/pipeline/newsletter/briefing')) return { stories: state.stories, rows: state.active.slice(0, Number(new URL(`http://x${path}`).searchParams.get('limit'))) }
    if (path.endsWith('/confirm-sent')) {
      state.pending = state.pending.filter((r) => !(body as { ids: number[] }).ids.includes(r.id))
      return { ok: true }
    }
    if (path.endsWith('/briefed')) {
      state.active = state.active.filter((r) => !(body as { ids: number[] }).ids.includes(r.id))
      return { ok: true }
    }
    throw new Error(path)
  })
  const mailer = { send: vi.fn(async (m: OutgoingMail) => { sent.push(m); return '<id>' }) }
  return { calls, sent, request: request as never, mailer }
}

// 07:40 PKT on 25 Oct 2026 = 02:40Z
const MORNING = new Date('2026-10-25T02:40:00Z')
const NOON = new Date('2026-10-25T09:00:00Z') // 14:00 PKT

describe('newsletter', () => {
  it('reads the Karachi day and minute', () => {
    expect(karachiNow(MORNING)).toMatchObject({ day: '2026-10-25', minutes: 7 * 60 + 40 })
    expect(karachiNow(new Date('2026-10-24T20:00:00Z')).day).toBe('2026-10-25')
  })

  it('confirmation mail carries the token link and no Auto-Submitted header', () => {
    const m = confirmMail(rows(1, 1)[0]!, 'https://zaviya.pk')
    expect(m.body).toContain('https://zaviya.pk/api/newsletter/confirm?token=tok1')
    const raw = buildMessage('news@zaviya.pk', m, '<x@zaviya.pk>')
    expect(raw).toContain('From: Zaviya News <news@zaviya.pk>')
    expect(raw).not.toContain('Auto-Submitted')
  })

  it('briefing has the 5 stories with utm links, the unsubscribe link and the one-click headers', () => {
    const m = briefingMail(rows(7, 1)[0]!, [1, 2, 3, 4, 5].map(story), 'https://zaviya.pk', 'Sunday 25 October')
    expect(m.body).toContain('https://zaviya.pk/pakistan/story-1?utm_source=newsletter')
    expect(m.body.match(/utm_source=newsletter/g)!.length).toBeGreaterThanOrEqual(5)
    expect(m.body).toContain('https://zaviya.pk/api/newsletter/unsubscribe?token=tok7')
    expect(m.bulk!.headers['List-Unsubscribe']).toBe('<https://zaviya.pk/api/newsletter/unsubscribe?token=tok7>')
    expect(m.bulk!.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    const raw = buildMessage('news@zaviya.pk', m, '<x@zaviya.pk>')
    expect(raw).toContain('List-Unsubscribe-Post: List-Unsubscribe=One-Click')
    expect(raw).toContain('Precedence: bulk')
  })

  it('Urdu subscribers get Urdu titles and /ur links', () => {
    const m = briefingMail(rows(9, 1, 'ur')[0]!, [1, 2, 3].map(story), 'https://zaviya.pk', 'x')
    expect(m.body).toContain('کہانی 1')
    expect(m.body).toContain('https://zaviya.pk/ur/pakistan/kahani-1?')
    expect(m.body).toContain('&lang=ur')
  })

  it('sends confirmations at any hour but the briefing only in its window', async () => {
    const f = fake({ pending: rows(1, 3), active: rows(100, 2), stories: [1, 2, 3, 4, 5].map(story) })
    const r = await runNewsletter({ request: f.request, mailer: f.mailer, kv: memoryKv(), site: 'https://zaviya.pk', now: () => NOON })
    expect(f.sent).toHaveLength(3)
    expect(f.sent.every((m) => m.subject.includes('Confirm'))).toBe(true)
    expect(r.briefing).toBeUndefined()
  })

  it('sends the briefing in the window, once per subscriber, and marks them', async () => {
    const f = fake({ pending: [], active: rows(100, 3), stories: [1, 2, 3, 4, 5].map(story) })
    const deps = { request: f.request, mailer: f.mailer, kv: memoryKv(), site: 'https://zaviya.pk', now: () => MORNING }
    await runNewsletter(deps)
    expect(f.sent).toHaveLength(3)
    expect(f.calls.find((c) => c.path.endsWith('/briefed'))!.body).toEqual({ ids: [100, 101, 102], day: '2026-10-25' })
    await runNewsletter(deps)
    expect(f.sent).toHaveLength(3) // nobody twice
  })

  it('stops at 200 mails an hour and carries on in the next run of the next hour', async () => {
    const f = fake({ pending: [], active: rows(1, 230), stories: [1, 2, 3, 4, 5].map(story) })
    const kv = memoryKv()
    await runNewsletter({ request: f.request, mailer: f.mailer, kv, site: 'https://zaviya.pk', now: () => MORNING })
    expect(f.sent).toHaveLength(SEND_PER_HOUR)
    await runNewsletter({ request: f.request, mailer: f.mailer, kv, site: 'https://zaviya.pk', now: () => new Date(MORNING.getTime() + 5 * 60_000) })
    expect(f.sent).toHaveLength(SEND_PER_HOUR) // same hour: budget used up
    await runNewsletter({ request: f.request, mailer: f.mailer, kv, site: 'https://zaviya.pk', now: () => new Date(MORNING.getTime() + 60 * 60_000) })
    expect(f.sent).toHaveLength(230)
  })

  it('skips the briefing with fewer than 3 fresh stories', async () => {
    const f = fake({ pending: [], active: rows(1, 2), stories: [story(1)] })
    const r = await runNewsletter({ request: f.request, mailer: f.mailer, kv: memoryKv(), site: 'https://zaviya.pk', now: () => MORNING })
    expect(f.sent).toHaveLength(0)
    expect(r.briefing).toMatchObject({ skipped: expect.stringContaining('fresh stories') })
  })

  it('a failing address does not block the others and is given up after 3 tries', async () => {
    const f = fake({ pending: rows(1, 2), active: [], stories: [] })
    f.mailer.send.mockImplementation(async (m: OutgoingMail) => {
      if (m.to === 'p1@example.com') throw new Error('SMTP RCPT: 550 no such user')
      f.sent.push(m)
      return '<id>'
    })
    const deps = { request: f.request, mailer: f.mailer, kv: memoryKv(), site: 'https://zaviya.pk', now: () => NOON }
    await runNewsletter(deps)
    expect(f.sent.map((m) => m.to)).toEqual(['p2@example.com'])
    await runNewsletter(deps)
    await runNewsletter(deps)
    const marked = f.calls.filter((c) => c.path.endsWith('/confirm-sent')).flatMap((c) => (c.body as { ids: number[] }).ids)
    expect(marked).toContain(1) // given up after 3 tries
  })
})
