import { describe, it, expect } from 'vitest'
import {
  dropUnsupportedFaqs,
  checkOriginality,
  checkUrduLocale,
  checkBannedAndClickbait,
  ngramOverlapRatio,
} from './qa-checks.js'

describe('qa-checks', () => {
  it('detects high ngram overlap', () => {
    const src = 'The quick brown fox jumps over the lazy dog repeatedly today in Lahore'
    const body = src + ' with extra words added'
    expect(ngramOverlapRatio(body, src)).toBeGreaterThan(0.5)
    expect(checkOriginality(body, [src]).length).toBeGreaterThan(0)
  })

  it('checks Urdu script ratio', () => {
    const ur = 'یہ ایک خبر ہے جو پاکستان کے بارے میں ہے اور قارئین کے لیے مفید معلومات فراہم کرتی ہے'
    expect(checkUrduLocale(ur)).toEqual([])
    expect(checkUrduLocale('This is English only article body without Urdu script')).not.toEqual([])
  })

  it('flags clickbait titles', () => {
    expect(checkBannedAndClickbait('You wont believe this SHOCKING news!!!', 'body')).not.toEqual([])
  })
})

import { stripQuotes as _sq, checkBannedAndClickbait as _bc, checkOriginality as _co } from './qa-checks.js'
describe('qa rule fixes', () => {
  it('allows "What happens next" as a body subheading but not in the title', () => {
    expect(_bc('Petrol price cut by Rs5', '## What happens next\nPrices apply from midnight.')).toEqual([])
    expect(_bc('What happens next will shock you', 'x').length).toBeGreaterThan(0)
  })
  it('does not count direct quotes as copying', () => {
    const quote = 'negligence in ensuring the safety of foreign nationals would not be tolerated at any cost whatsoever'
    const src = `The IGP said ${quote} during the meeting.`
    const body = `Police chiefs reviewed protection plans on Saturday. The IGP warned: "${quote}." Officers will audit permits.`
    expect(_sq(body)).not.toContain('tolerated')
    expect(_co(body, [src])).toEqual([])
  })
})

describe('FAQ questions must be supported by the sources (ZAV-200)', () => {
  const sources = 'Arshad Nadeem threw 86.2m to win javelin gold at the national championship in Lahore. He said he is preparing for next year.'
  it('drops a question about an event no source mentions', () => {
    const faqs = [
      { q: 'How far did Arshad Nadeem throw?', a: '86.2m.' },
      { q: 'Did Arshad Nadeem withdraw from a Switzerland event?', a: 'No.' },
      { q: 'Did he throw 90m?', a: 'No.' },
    ]
    const { kept, dropped } = dropUnsupportedFaqs(faqs, sources)
    expect(kept.map((f) => f.q)).toEqual(['How far did Arshad Nadeem throw?'])
    expect(dropped).toHaveLength(2)
  })
  it('keeps plain questions and ignores sentence-initial capitals', () => {
    const { kept } = dropUnsupportedFaqs([{ q: 'What did he say about next year?', a: 'x' }, { q: 'Kya Lahore mein hua?', a: 'x' }], sources)
    expect(kept).toHaveLength(2)
  })
})
