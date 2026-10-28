import { describe, expect, it } from 'vitest'
import type { ArticleCard, ArticleFull } from '@zaviya/shared'
import {
  buildBreakingStory,
  buildDigestStory,
  dailyStorySlug,
  groupStoryDigests,
  parseDailyStorySlug,
  pktDate,
} from '@/lib/web-stories'

const card = (id: number, iso: string, extra: Partial<ArticleCard> = {}): ArticleCard =>
  ({
    id: String(id),
    slug: `story-${id}`,
    locale: 'en',
    href: `/pakistan/story-${id}`,
    title: `Story ${id} & more`,
    dek: `Dek ${id}`,
    category: { slug: 'pakistan', name: 'Pakistan', color: '#000' },
    publishedAt: iso,
    ...extra,
  }) as ArticleCard

describe('web stories (ZAV-242)', () => {
  it('days are Pakistan days: 20:00 UTC is already the next day in Pakistan', () => {
    expect(pktDate('2026-10-27T20:00:00Z')).toBe('2026-10-28')
    expect(pktDate('2026-10-28T18:59:00Z')).toBe('2026-10-28')
  })
  it('daily slug round trip, and article slugs are not daily slugs', () => {
    expect(parseDailyStorySlug(dailyStorySlug('2026-10-28'))).toBe('2026-10-28')
    expect(parseDailyStorySlug('daily-news')).toBeNull()
    expect(parseDailyStorySlug('a-daily-2026-10-28')).toBeNull()
  })
  it('groups by day, newest day first, top 5 by priority then image, up to 3 breaking, skips items without a dek', () => {
    const cards = [
      ...Array.from({ length: 7 }, (_, i) => card(i, `2026-10-28T0${i}:00:00Z`)),
      card(20, '2026-10-28T09:00:00Z', { priority: 'high' }),
      card(21, '2026-10-28T10:00:00Z', { isBreaking: true }),
      card(22, '2026-10-28T11:00:00Z', { dek: undefined }),
      card(30, '2026-10-26T09:00:00Z'),
    ]
    const days = groupStoryDigests(cards)
    expect(days.map((d) => d.date)).toEqual(['2026-10-28', '2026-10-26'])
    expect(days[0].top).toHaveLength(5)
    expect(days[0].top[0].id).toBe('20')
    expect(days[0].top.map((c) => c.id)).not.toContain('22')
    expect(days[0].breaking.map((c) => c.id)).toEqual(['21'])
  })
  it('digest story is valid-looking AMP: self canonical, required story attributes, escaped text, an outlink per item', () => {
    const [day] = groupStoryDigests(Array.from({ length: 4 }, (_, i) => card(i, `2026-10-28T0${i}:00:00Z`)))
    const html = buildDigestStory(day)
    expect(html).toMatch(/^<!doctype html>\n<html ⚡ lang="en">/)
    expect(html).toContain('<link rel="canonical" href="https://')
    expect(html).toContain('/web-stories/daily-2026-10-28"')
    for (const attr of ['standalone', 'title="', 'publisher="', 'publisher-logo-src="https://', 'poster-portrait-src="https://'])
      expect(html).toContain(attr)
    expect(html).toContain('Story 0 &amp; more')
    expect(html).not.toContain('Story 0 & more')
    expect((html.match(/<amp-story-page-outlink/g) ?? []).length).toBe(5) // 4 items + closing page
    expect(html).not.toContain('<script src') // only async AMP scripts
  })
  it('breaking story links its last page to the article', () => {
    const a = { ...card(1, '2026-10-28T01:00:00Z', { isBreaking: true }), keyPoints: ['Point one', 'Point two'] } as unknown as ArticleFull
    const html = buildBreakingStory(a)
    expect(html).toContain('Point two')
    expect(html).toContain('/web-stories/story-1"')
    expect(html).toMatch(/<a href="https:\/\/[^"]+\/pakistan\/story-1">Read the full story<\/a>/)
  })
})
