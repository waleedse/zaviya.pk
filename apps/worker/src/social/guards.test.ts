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

describe('numbersNotInArticle: valid shorthand (ZAV-130)', () => {
  it('accepts k / m / bn shorthand for the full figure and the reverse', () => {
    const text = 'Daily hot meals drop from 250,000 to 150,000. The caseload fell from 1.6 million to 1.1 million. Wheat: 160,000 of 2.5 million tonnes.'
    expect(numbersNotInArticle('Hot meals 250k to 150k a day; caseload 1.6m to 1.1m; 160k of 2.5m tonnes', text)).toEqual([])
    expect(numbersNotInArticle('Reserves 21,500,000,000', 'Reserves hit $21.5bn')).toEqual([])
  })
  it('still catches a wrong figure behind a suffix', () => {
    expect(numbersNotInArticle('Hot meals 350k a day', 'Daily hot meals drop from 250,000 to 150,000')).toEqual(['350'])
    expect(numbersNotInArticle('Reserves $1.5bn', article)).toEqual(['1.5'])
  })
  it('accepts numbers the article spells out in words', () => {
    expect(numbersNotInArticle('4 militants killed; night cuts now 2 hours', 'Four militants were killed. Night cuts stay at two hours.')).toEqual([])
    expect(numbersNotInArticle('7 militants killed', 'Four militants were killed.')).toEqual(['7'])
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
