import { describe, it, expect, vi } from 'vitest'
import { matchTrends, checkKeywordUsage, googleSuggest, seoBrief, type SeoPlan } from './seo.js'

const plan: SeoPlan = {
  primaryKeyword: 'petrol price in pakistan',
  secondaryKeywords: ['petrol price today'],
  urduKeywords: ['پیٹرول کی قیمت'],
  romanUrduQueries: ['petrol ki qeemat'],
  searchIntent: 'price-check',
  titleAngle: 'Exact new price per litre',
  faqQuestions: ['what is petrol price today'],
}

describe('seo', () => {
  it('matches trends sharing words with the story', () => {
    expect(matchTrends('Government cuts petrol price by Rs5 per litre', ['petrol price', '#PSL2026', 'Champions Trophy'])).toEqual(['petrol price'])
  })
  it('flags missing keyword usage', () => {
    const issues = checkKeywordUsage(plan, { title: 'Government cuts fuel rates', dek: 'x', bodyMarkdown: 'no headings here' })
    expect(issues).toHaveLength(3)
    expect(checkKeywordUsage(plan, { title: 'Petrol price in Pakistan cut by Rs5', dek: '', bodyMarkdown: 'The petrol price in Pakistan fell.\n\n## Details' })).toEqual([])
  })
  it('parses Google suggest responses', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify(['petrol', ['petrol price in pakistan', 'petrol price today']]))) as unknown as typeof fetch
    await expect(googleSuggest('petrol', 'en', fetchFn)).resolves.toEqual(['petrol price in pakistan', 'petrol price today'])
  })
  it('builds locale briefs', () => {
    expect(seoBrief(plan, 'en')).toContain('petrol price in pakistan')
    expect(seoBrief(plan, 'ur')).toContain('پیٹرول کی قیمت')
  })
})

describe('stuffing checks', () => {
  it('flags repeated keywords and lowercase pakistan', () => {
    const body = 'The pakistan unemployment rate rose. ' + 'Petrol price in Pakistan '.repeat(7) + '\n## Details'
    const issues = checkKeywordUsage(plan, { title: 'Petrol price in Pakistan cut', dek: '', bodyMarkdown: body })
    expect(issues.some((i) => i.includes('stuffing'))).toBe(true)
    expect(issues.some((i) => i.includes('capitalised'))).toBe(true)
  })
})
