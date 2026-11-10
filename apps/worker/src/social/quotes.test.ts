import { describe, expect, it } from 'vitest'
import type { XPost } from '@zaviya/shared'
import { WATCHLIST, QUOTE_RULES } from './quote-config.js'
import { decideQuoteSlot, extractDirectQuotes, inQuoteHours, isVerbatim, quoteCopy, quoteFromXPost, quoteId, unsafeReason } from './quotes.js'

const NOW = Date.parse('2026-11-11T09:00:00Z') // 14:00 PKT
const musk = WATCHLIST.find((p) => p.handle === 'elonmusk')!
const post = (over: Partial<XPost> = {}): XPost => ({
  id: '1',
  author: 'elonmusk',
  text: 'The future of AI will be decided by who builds the most compute and uses it well.',
  url: 'https://x.com/elonmusk/status/1',
  createdAt: new Date(NOW - 30 * 60_000).toISOString(),
  mediaUrls: [],
  ...over,
})

describe('verbatim check', () => {
  it('finds the quote word for word, ignoring case, spacing and curly apostrophes', () => {
    expect(isVerbatim("We won’t stop", 'He said: We won\'t   stop until it is done')).toBe(true)
    expect(isVerbatim('We will stop soon', 'We will not stop soon')).toBe(false)
  })
})

describe('direct quotes in articles', () => {
  it('takes text in quotation marks with a named speaker, exactly as written', () => {
    const text = 'Speaking in Dubai, Sam Altman, chief executive of OpenAI, said: “We expect compute to become the scarcest resource in the world by next year.” More follows.'
    const q = extractDirectQuotes(text)
    expect(q).toHaveLength(1)
    expect(q[0]!.speaker).toBe('Sam Altman')
    expect(q[0]!.role).toBe('Chief executive of OpenAI')
    expect(q[0]!.quote).toBe('We expect compute to become the scarcest resource in the world by next year')
    expect(isVerbatim(q[0]!.quote, text)).toBe(true)
  })
  it('handles "quote," said Name', () => {
    const q = extractDirectQuotes('“Pakistan will not accept any decision imposed on its economy from outside,” said Ishaq Dar on Tuesday.')
    expect(q[0]?.speaker).toBe('Ishaq Dar')
  })
  it('ignores short scare quotes and quotes with no named speaker', () => {
    expect(extractDirectQuotes('The so-called "peace plan" was rejected, said Ali Khan.')).toEqual([])
    expect(extractDirectQuotes('"This is a quote with plenty of words in it but nobody is named here at all."')).toEqual([])
  })
})

describe('safety filter', () => {
  it.each([
    ['You are a stupid clown and everyone knows it', 'insult'],
    ['The army must stay out of politics for good', 'army'],
    ['This is an attack on Islam and its followers', 'religion'],
    ['We should take to the streets and burn it down', 'incitement'],
    ['PTI workers were treated unfairly by the courts', 'party-political'],
    ['The finance minister has failed the country', 'attack'],
  ])('skips %s', (text, why) => {
    expect(unsafeReason(text)).toBe(why)
  })
  it('lets a plain statement through', () => {
    expect(unsafeReason('AI will change how every business in the country works over the next decade.')).toBeNull()
  })
  it('skips Urdu insults and army mentions', () => {
    expect(unsafeReason('یہ لوگ چور ہیں')).toBe('insult')
    expect(unsafeReason('فوج کا کردار')).toBe('army')
  })
})

describe('quotes from the watch-list on X', () => {
  it('turns a personality post into a candidate with the post as the source', () => {
    const c = quoteFromXPost(post(), musk, NOW)!
    expect(c.quote).toBe(post().text)
    expect(c.sourceLabel).toBe('@elonmusk on X')
    expect(c.sourceUrl).toBe('https://x.com/elonmusk/status/1')
    expect(c.speaker).toBe('Elon Musk')
    expect(isVerbatim(c.quote, post().text)).toBe(true)
  })
  it('trims a trailing link but keeps the words unchanged', () => {
    const c = quoteFromXPost(post({ text: `${post().text} https://t.co/abc` }), musk, NOW)!
    expect(c.quote).toBe(post().text)
  })
  it('skips replies, retweets, other authors, stale posts, links inside, hashtags, and short or long posts', () => {
    expect(quoteFromXPost(post({ text: '@someone ' + post().text }), musk, NOW)).toBeNull()
    expect(quoteFromXPost(post({ text: 'RT @x: ' + post().text }), musk, NOW)).toBeNull()
    expect(quoteFromXPost(post({ author: 'someoneelse' }), musk, NOW)).toBeNull()
    expect(quoteFromXPost(post({ createdAt: new Date(NOW - 20 * 3600_000).toISOString() }), musk, NOW)).toBeNull()
    expect(quoteFromXPost(post({ text: 'Look at https://t.co/abc the future of AI compute and energy matters' }), musk, NOW)).toBeNull()
    expect(quoteFromXPost(post({ text: post().text + ' #AI' }), musk, NOW)).toBeNull()
    expect(quoteFromXPost(post({ text: 'Too short to be a quote.' }), musk, NOW)).toBeNull()
    expect(quoteFromXPost(post({ text: 'word '.repeat(60) }), musk, NOW)).toBeNull()
  })
})

describe('quote ids', () => {
  it('is the same for the same words by the same person, whatever the punctuation or case', () => {
    expect(quoteId('Elon Musk', 'The future of AI, will be decided!')).toBe(quoteId('elon musk', 'the future of AI will be decided'))
    expect(quoteId('Elon Musk', 'a b c')).not.toBe(quoteId('Sam Altman', 'a b c'))
  })
})

describe('quote card caps and quiet hours', () => {
  const pkt = (h: number, m = 0) => Date.parse(`2026-11-11T00:00:00Z`) + ((h - 5) * 60 + m) * 60_000
  it('knows the 00:00-08:00 PKT quiet hours', () => {
    expect(inQuoteHours(pkt(7, 59))).toBe(false)
    expect(inQuoteHours(pkt(8))).toBe(true)
    expect(inQuoteHours(pkt(23, 59))).toBe(true)
  })
  it('posts when the rules allow', () => {
    expect(decideQuoteSlot({ now: pkt(14), postedToday: 2, lastPostedAt: pkt(12) })).toEqual({ action: 'post' })
  })
  it('stops at 6 a day', () => {
    expect(decideQuoteSlot({ now: pkt(14), postedToday: QUOTE_RULES.maxPerDay })).toMatchObject({ action: 'skip' })
  })
  it('keeps 60 minutes between cards', () => {
    const d = decideQuoteSlot({ now: pkt(14, 20), postedToday: 1, lastPostedAt: pkt(14) })
    expect(d).toMatchObject({ action: 'delay', until: pkt(15), reason: 'spacing' })
  })
  it('waits for 08:00 PKT in the small hours', () => {
    const d = decideQuoteSlot({ now: pkt(3), postedToday: 0 })
    expect(d).toMatchObject({ action: 'delay', until: pkt(8) })
  })
})

describe('quote copy', () => {
  const c = { quote: 'AI is the future of work.', speaker: 'Sam Altman', role: 'CEO of OpenAI', sourceLabel: '@sama on X', sourceUrl: 'https://x.com/sama/status/9' }
  it('carries the source in the caption, with the original link only when there is no Zaviya story', () => {
    const noStory = quoteCopy(c)
    expect(noStory.facebook).toContain('Source: @sama on X')
    expect(noStory.facebook).toContain('https://x.com/sama/status/9')
    expect(noStory.facebook).toContain('“AI is the future of work.”')
    const story = quoteCopy({ ...c, articleUrl: 'https://zaviya.pk/ai/story' })
    expect(story.facebook).not.toContain('x.com/sama')
  })
  it('never cuts a quote for X: a long one is left to the card', () => {
    const long = quoteCopy({ ...c, quote: 'alpha '.repeat(50).trim() })
    expect(long.x).not.toContain('alpha')
    expect(long.x.length).toBeLessThan(260)
    expect(quoteCopy(c).x).toContain('“AI is the future of work.”')
  })
})
