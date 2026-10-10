import { describe, it, expect } from 'vitest'
import {
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
