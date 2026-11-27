import { describe, expect, it } from 'vitest'
import type { XPost } from '@zaviya/shared'
import { ageMs, authorHandle, blockReason, decideViral, inViralHours, matchStory, scoreViral, sourceFor, textTooThin, viewsPerHour, viralCopy, viralSlot } from './viral.js'
import { VIRAL_SOURCES, viralMode } from './viral-config.js'

const NOW = Date.parse('2026-11-28T10:00:00Z')
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString()

function post(over: Partial<XPost> = {}): XPost {
  return {
    id: '2126000000000000001',
    author: 'HamidMirPAK',
    text: 'Supreme Court constitutional bench hears the petition, next hearing on Monday morning',
    url: 'https://x.com/i/web/status/2126000000000000001',
    createdAt: ago(90),
    mediaUrls: [],
    views: 60_000,
    likes: 1_200,
    reposts: 300,
    replies: 80,
    hasVideo: true,
    ...over,
  }
}

const stories = [
  { title: 'Supreme Court constitutional bench sets Monday hearing on petition', url: 'https://zaviya.pk/pakistan/sc-bench-monday-hearing' },
  { title: 'PIA rebooks UK passengers, offers full refund option', url: 'https://zaviya.pk/pakistan/pia-restores-uk-flight-operations' },
]

describe('helpers', () => {
  it('reads the handle, age and views per hour', () => {
    expect(authorHandle({ author: '@HamidMirPAK' })).toBe('HamidMirPAK')
    expect(ageMs({ createdAt: ago(60) }, NOW)).toBe(3_600_000)
    expect(viewsPerHour({ views: 30_000, createdAt: ago(120) }, NOW)).toBe(15_000)
    expect(ageMs({ createdAt: 'nonsense' }, NOW)).toBe(Number.POSITIVE_INFINITY)
  })
  it('finds a source case-insensitively and nothing for a stranger', () => {
    expect(sourceFor('hamidmirpak')?.name).toBe('Hamid Mir')
    expect(sourceFor('randomguy123')).toBeUndefined()
  })
  it('keeps the mode safe: unknown or empty is dry', () => {
    expect(viralMode(undefined)).toBe('dry')
    expect(viralMode('LIVE')).toBe('live')
    expect(viralMode('off')).toBe('off')
    expect(viralMode('yes')).toBe('dry')
  })
})

describe('blockReason', () => {
  it('blocks graphic or tragic footage, insults, slogans and promotions', () => {
    expect(blockReason('Dead bodies pulled from the rubble in Karachi')).toBe('graphic or tragic footage')
    expect(blockReason('کراچی میں عمارت گرنے سے جاں بحق')).toBe('graphic or tragic footage')
    expect(blockReason('He is a traitor and a thief')).toBe('insult or incitement')
    expect(blockReason('Khan ka sipahi')).toBe('party slogan')
    expect(blockReason('Giveaway: follow me and retweet')).toBe('promotion or spam')
  })
  it('lets court and politics news through', () => {
    expect(blockReason('Court accuses the prosecution of delay and reserves its verdict')).toBeNull()
    expect(blockReason('PM announces fuel relief for vehicles up to 1,000cc')).toBeNull()
  })
})

describe('textTooThin', () => {
  it('flags emoji-only and link-only posts', () => {
    expect(textTooThin('🔥🔥 https://t.co/abc')).toBe(true)
    expect(textTooThin('Watch this #viral @someone')).toBe(true)
    expect(textTooThin('Chief Justice hears the petition in open court today')).toBe(false)
  })
})

describe('matchStory', () => {
  it('matches the story that shares the event words', () => {
    expect(matchStory(post().text, stories)?.url).toContain('sc-bench')
  })
  it('does not match unrelated stories', () => {
    expect(matchStory('Rain expected in Lahore tomorrow evening', stories)).toBeUndefined()
  })
})

describe('scoreViral', () => {
  const src = VIRAL_SOURCES.find((s) => s.handle === 'HamidMirPAK')!
  it('is higher with a matching story and a video', () => {
    const base = scoreViral(post({ hasVideo: false }), src, NOW)
    const withVideo = scoreViral(post(), src, NOW)
    const withStory = scoreViral(post(), src, NOW, stories[0])
    expect(withVideo).toBeGreaterThan(base)
    expect(withStory).toBeGreaterThan(withVideo)
  })
  it('is higher for more views', () => {
    expect(scoreViral(post({ views: 500_000 }), src, NOW)).toBeGreaterThan(scoreViral(post({ views: 20_000 }), src, NOW))
  })
})

describe('decideViral', () => {
  it('posts a fast, big video from a watched journalist and links our story', () => {
    const d = decideViral(post(), { now: NOW, stories })
    expect(d.action).toBe('post')
    if (d.action === 'post') expect(d.story?.url).toContain('sc-bench')
  })
  it('skips strangers, non-video, old, young, small and slow posts', () => {
    expect(decideViral(post({ author: 'randomguy123' }), { now: NOW, stories })).toMatchObject({ action: 'skip', reason: 'not a watched account' })
    expect(decideViral(post({ hasVideo: false }), { now: NOW, stories })).toMatchObject({ reason: 'no video' })
    expect(decideViral(post({ createdAt: ago(9 * 60) }), { now: NOW, stories })).toMatchObject({ reason: 'older than 8 hours' })
    expect(decideViral(post({ createdAt: ago(3) }), { now: NOW, stories })).toMatchObject({ reason: 'too new to judge' })
    expect(decideViral(post({ views: 2_000 }), { now: NOW, stories }).action).toBe('skip')
    expect(decideViral(post({ views: 9_000, createdAt: ago(400) }), { now: NOW, stories })).toMatchObject({ action: 'skip' })
    expect(decideViral(post({ views: undefined }), { now: NOW, stories })).toMatchObject({ reason: 'view count not visible' })
  })
  it('never amplifies tragic footage', () => {
    expect(decideViral(post({ text: 'Moment the building collapsed, victims still under the rubble in Karachi' }), { now: NOW, stories })).toMatchObject({ action: 'skip', reason: 'graphic or tragic footage' })
  })
  it('needs one of our own stories for a global source', () => {
    const g = post({ author: 'Reuters', text: 'Footage shows a crowd gathering outside the parliament in Paris', views: 400_000, createdAt: ago(60) })
    expect(decideViral(g, { now: NOW, stories })).toMatchObject({ action: 'skip', reason: 'global video with no Zaviya story on it' })
  })
})

describe('viralCopy', () => {
  const src = VIRAL_SOURCES.find((s) => s.handle === 'HamidMirPAK')!
  it('puts our headline and utm link first and the original post last (so X quotes it)', () => {
    const c = viralCopy(post(), src, stories[0])
    const lines = c.split('\n')
    expect(lines[0]).toBe(stories[0]!.title)
    expect(lines[1]).toBe('https://zaviya.pk/pakistan/sc-bench-monday-hearing?utm_source=x')
    expect(lines[2]).toBe('https://x.com/HamidMirPAK/status/2126000000000000001')
  })
  it('credits the source when there is no story, and stays inside 280 characters', () => {
    const long = post({ text: 'word '.repeat(120) })
    const c = viralCopy(long, src)
    expect(c.startsWith('Video from Hamid Mir:')).toBe(true)
    expect(c.endsWith('https://x.com/HamidMirPAK/status/2126000000000000001')).toBe(true)
    const withoutUrl = c.replace(/https:\/\/x\.com\/\S+/, 'u'.repeat(23))
    expect(withoutUrl.length).toBeLessThanOrEqual(280)
  })
})

describe('daily limits', () => {
  it('works in PKT: 08:00-24:00 only', () => {
    expect(inViralHours(Date.parse('2026-11-28T02:00:00Z'))).toBe(false) // 07:00 PKT
    expect(inViralHours(Date.parse('2026-11-28T03:00:00Z'))).toBe(true) // 08:00 PKT
    expect(inViralHours(Date.parse('2026-11-28T19:30:00Z'))).toBe(false) // 00:30 PKT
  })
  it('stops at the daily limit and keeps spacing', () => {
    expect(viralSlot({ now: NOW, postedToday: 4 })).toMatchObject({ ok: false })
    expect(viralSlot({ now: NOW, postedToday: 1, lastPostedAt: NOW - 30 * 60_000 })).toMatchObject({ ok: false, reason: 'spacing' })
    expect(viralSlot({ now: NOW, postedToday: 1, lastPostedAt: NOW - 120 * 60_000 })).toEqual({ ok: true })
  })
})
