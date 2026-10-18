import { describe, expect, it } from 'vitest'
import { findDuplicateStory, numbersNotInArticle, similarTitles } from './guards.js'

const article = 'SBP governor Jameel Ahmad said foreign exchange reserves stand at $21.5bn. Inflation fell to 6.2% and 1,200 jobs were cited.'

describe('numbersNotInArticle', () => {
  it('catches the dropped digit (1.5bn vs 21.5bn)', () => {
    expect(numbersNotInArticle('SBP: FX reserves at $1.5bn #Pakistan https://zaviya.pk/a/2026', article)).toEqual(['1.5'])
  })
  it('accepts numbers that are in the article, with or without separators', () => {
    expect(numbersNotInArticle('Reserves $21.5bn, inflation 6.2%, 1200 jobs', article)).toEqual([])
  })
  it('ignores digits in links and hashtags', () => {
    expect(numbersNotInArticle('Reserves $21.5bn #Budget2027 https://zaviya.pk/x-9999', article)).toEqual([])
  })
})

describe('duplicate stories', () => {
  const a = 'SBP governor economic outlook Jameel Ahmad Bangkok'
  const b = 'SBP governor Jameel Ahmad says Pakistan economy shock absorbed'
  it('treats near-identical headlines as one story', () => {
    expect(similarTitles(a, b)).toBe(true)
    expect(similarTitles(a, 'Pakistan beat India in Asia Cup final')).toBe(false)
  })
  it('matches the same cluster even with different titles, never itself', () => {
    const recent = [{ articleId: '1', clusterId: '9', title: 'Something else entirely about weather' }]
    expect(findDuplicateStory({ articleId: '2', clusterId: '9', title: 'Heavy rain expected' }, recent)).toBeTruthy()
    expect(findDuplicateStory({ articleId: '1', clusterId: '9', title: 'x' }, recent)).toBeUndefined()
  })
  it('finds the earlier SBP post by title', () => {
    expect(findDuplicateStory({ articleId: '447', title: b }, [{ articleId: '445', title: a }])).toBeTruthy()
  })
})
