import { describe, expect, it } from 'vitest'
import { buildAllCaptions, buildCaptions, buildHashtags, HASHTAG_CAP, PLATFORMS, pickHashtags, toHashtag, trackedLink, X_LIMIT, xLength } from './captions'
import { compose } from './compose'
import type { EditionInput, StoryInput, TrackInfo } from './types'

const TRACKS: TrackInfo[] = [
  { id: 'b1', file: 'audio/b1.wav', bpm: 120, firstBeatMs: 0, mood: 'bright' },
  { id: 'n1', file: 'audio/n1.wav', bpm: 110, firstBeatMs: 0, mood: 'night' },
  { id: 'c1', file: 'audio/c1.wav', bpm: 80, firstBeatMs: 0, mood: 'calm' },
]
const DATE = '2026-10-17T03:00:00Z'
const TAGS = [
  ['State Bank of Pakistan', 'Donald Trump', 'news', 'IMF'],
  ['Ukraine', 'Russia', 'state bank of pakistan'],
  ['Raast', 'اردو', 'x'],
]
const story = (i: number, over: Partial<StoryInput> = {}): StoryInput => ({
  id: i + 1,
  slug: `s${i}`,
  title: `Story ${i} headline that is long enough to be interesting to readers`,
  dek: 'A fairly long standfirst that adds some context to the headline for readers who stay.',
  category: ['pakistan', 'business', 'world', 'cricket'][i % 4]!,
  image: `${i}.jpg`,
  sources: [{ name: 'Dawn', tier: 2 }],
  isBreaking: false,
  priority: 'normal',
  publishedAt: DATE,
  tags: TAGS[i % 3],
  ...over,
})
const input = (n: number, over: Partial<EditionInput> = {}): EditionInput => ({ edition: 'evening', date: DATE, stories: Array.from({ length: n }, (_, i) => story(i)), rates: [], ...over })
const URL = 'https://zaviya.pk'

describe('toHashtag', () => {
  it('camel-cases', () => {
    expect(toHashtag('State Bank of Pakistan')).toBe('#StateBankOfPakistan')
    expect(toHashtag('Donald Trump')).toBe('#DonaldTrump')
    expect(toHashtag('oil refineries')).toBe('#OilRefineries')
  })
  it('strips non-alphanumerics and non-ASCII', () => {
    expect(toHashtag("Rana Tanveer-Hussain's")).toBe('#RanaTanveerHussainS')
    expect(toHashtag('Café Zaviya')).toBe('#CafeZaviya')
    expect(toHashtag('اردو')).toBeNull()
  })
  it('skips too short, too long and generic', () => {
    expect(toHashtag('x')).toBeNull()
    expect(toHashtag('National Agricultural Research Centre')).toBeNull()
    expect(toHashtag('news')).toBeNull()
    expect(toHashtag('Latest')).toBeNull()
    expect(toHashtag('2026')).toBeNull()
  })
  it('keeps acronyms', () => {
    expect(toHashtag('IMF')).toBe('#IMF')
  })
})

describe('buildHashtags', () => {
  const t = compose(input(6), 'roundup60', TRACKS)
  it('starts with the core tag and ends with the brand', () => {
    const h = buildHashtags(t, input(6).stories)
    expect(h[0]).toBe('#PakistanNews')
    expect(h.at(-1)).toBe('#Zaviya')
  })
  it('dedupes case-insensitively', () => {
    const h = buildHashtags(t, input(6).stories)
    const lower = h.map((x) => x.toLowerCase())
    expect(new Set(lower).size).toBe(lower.length)
  })
  it('puts the lead story tags before category tags', () => {
    const h = buildHashtags(t, input(6).stories)
    const lead = input(6).stories[0]!.tags!.map((x) => toHashtag(x))
    expect(lead).toContain(h[1])
    expect(h.indexOf(h[1]!)).toBeLessThan(h.indexOf('#Pakistan'))
  })
  it('boosts a trending term right after the core tag', () => {
    const h = buildHashtags(t, input(6).stories, ['raast'])
    expect(h[1]).toBe('#Raast')
    const none = buildHashtags(t, input(6).stories, ['unrelated term'])
    expect(none).not.toContain('#UnrelatedTerm')
  })
  it('uses topic core tags', () => {
    const ai = compose(input(6, { topic: 'ai-tech' }), 'topic60', TRACKS)
    expect(buildHashtags(ai, input(6).stories)[0]).toBe('#AI')
    const money = compose(input(6, { topic: 'money', rates: [] }), 'money45', TRACKS)
    expect(buildHashtags(money, input(6).stories)[0]).toBe('#PakistanEconomy')
  })
  it('pickHashtags caps and keeps the brand last', () => {
    const all = ['#A1b', '#B2c', '#C3d', '#D4e', '#E5f', '#Zaviya']
    expect(pickHashtags(all, 5)).toEqual(['#A1b', '#B2c', '#C3d', '#D4e', '#Zaviya'])
    expect(pickHashtags(all, 2)).toEqual(['#A1b', '#Zaviya'])
    expect(pickHashtags(all, 1)).toEqual(['#A1b'])
  })
})

describe('buildCaptions', () => {
  const t12 = compose(input(12), 'roundup60', TRACKS)
  const stories12 = input(12).stories
  const caps = buildAllCaptions(t12, stories12, URL)

  it('respects every platform hashtag cap', () => {
    for (const p of PLATFORMS) {
      expect(caps[p].hashtags.length).toBeLessThanOrEqual(HASHTAG_CAP[p])
      for (const h of caps[p].hashtags) expect(caps[p].text).toContain(h)
    }
    expect(caps.instagram.hashtags).toHaveLength(5)
    expect(caps.facebook.hashtags).toHaveLength(3)
    expect(caps.threads.hashtags).toHaveLength(1)
  })
  it('instagram: numbered headlines, prompt, bio link, hashtags last, no hashtag in first comment', () => {
    const ig = caps.instagram
    expect(ig.text).toContain('1. ')
    expect(ig.text).toContain('12. ')
    expect(ig.text).toContain('Comment the number you want explained 👇')
    expect(ig.text).toContain('link in bio')
    expect(ig.text.split('\n').at(-1)).toBe(ig.hashtags.join(' '))
    expect(ig.text.length).toBeLessThanOrEqual(2200)
    expect(ig.firstComment).toContain('utm_source=instagram')
    expect(ig.firstComment).not.toContain('#')
  })
  it('instagram drops dek lines first when over the limit', () => {
    const long = input(12)
    long.stories = long.stories.map((s) => ({ ...s, dek: 'word '.repeat(60) }))
    const t = compose(long, 'roundup60', TRACKS)
    const ig = buildCaptions(t, long.stories, { platform: 'instagram', url: URL })
    expect(ig.text.length).toBeLessThanOrEqual(2200)
    expect(ig.text).toContain('1. ')
  })
  it('instagram trims headlines as a last resort', () => {
    const t = compose(input(12), 'roundup60', TRACKS)
    const huge = input(12).stories.map((s) => ({ ...s, title: 'x'.repeat(300) }))
    const ig = buildCaptions({ ...t, scenes: t.scenes.map((s) => (s.kind === 'story' ? { ...s, headline: 'y'.repeat(300), dek: undefined } : s)) }, huge, { platform: 'instagram', url: URL })
    expect(ig.text.length).toBeLessThanOrEqual(2200)
  })
  it('facebook carries the direct tracked link', () => {
    expect(caps.facebook.text).toContain('https://zaviya.pk/?utm_source=facebook&utm_medium=video&utm_campaign=roundup60-2026-10-17')
  })
  it('tiktok lists the first five headlines and comment 1-N', () => {
    expect(caps.tiktok.text).toContain('5. ')
    expect(caps.tiktok.text).not.toContain('6. ')
    expect(caps.tiktok.text).toContain('Comment 1–12')
    expect(caps.tiktok.text.length).toBeLessThanOrEqual(2200)
  })
  it('youtube: title <= 100, 3 hashtags, chapters for roundup60', () => {
    const yt = caps.youtube
    expect(yt.title!.length).toBeLessThanOrEqual(100)
    expect(yt.title).toMatch(/^Pakistan News Today: /)
    expect(yt.title).toContain('& 11 more #Shorts')
    expect(yt.hashtags.length).toBeLessThanOrEqual(3)
    expect(yt.text).toContain('0:00 Intro')
    expect(yt.text).toMatch(/\n0:0\d 1\. /)
    expect(yt.text).toContain('utm_source=youtube')
  })
  it('youtube title stays within 100 with a very long lead headline', () => {
    const t = compose(input(6), 'headlines30', TRACKS)
    const long = { ...t, scenes: t.scenes.map((s) => (s.kind === 'story' && s.index === 1 ? { ...s, headline: 'a very long headline '.repeat(10) } : s)) }
    expect(buildCaptions(long, input(6).stories, { platform: 'youtube', url: URL }).title!.length).toBeLessThanOrEqual(100)
  })
  it('no chapters outside roundup60', () => {
    const t = compose(input(6), 'headlines30', TRACKS)
    expect(buildCaptions(t, input(6).stories, { platform: 'youtube', url: URL }).text).not.toContain('0:00 Intro')
  })
  it('x: <= 280 with url weighted as 23, <= 2 hashtags', () => {
    expect(xLength(caps.x.text)).toBeLessThanOrEqual(X_LIMIT)
    expect(caps.x.hashtags.length).toBeLessThanOrEqual(2)
    expect(xLength('see https://zaviya.pk/?utm_source=x&utm_medium=video&utm_campaign=a-b ok')).toBe(4 + 23 + 3)
  })
  it('x with very long headlines still fits', () => {
    const t = compose(input(6), 'headlines30', TRACKS)
    const long = { ...t, scenes: t.scenes.map((s) => (s.kind === 'story' ? { ...s, headline: 'long '.repeat(40) } : s)) }
    expect(xLength(buildCaptions(long, input(6).stories, { platform: 'x', url: URL }).text)).toBeLessThanOrEqual(X_LIMIT)
  })
  it('threads <= 500 characters', () => {
    expect(caps.threads.text.length).toBeLessThanOrEqual(500)
  })
  it('every link has utm parameters with format and date', () => {
    expect(trackedLink(URL, 'tiktok', 'money45', DATE)).toBe('https://zaviya.pk/?utm_source=tiktok&utm_medium=video&utm_campaign=money45-2026-10-17')
    expect(trackedLink('https://zaviya.pk/', 'x', 'flash15', DATE)).toContain('zaviya.pk/?utm_source=x')
  })
  it('is deterministic', () => {
    expect(buildAllCaptions(t12, stories12, URL)).toEqual(caps)
  })
})
