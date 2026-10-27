import { describe, it, expect } from 'vitest'
import { scrubSeoPhrases, scrubSeoSlug, scrubLede, scrubWriterCopy, checkSeoStuffing } from './seo-scrub.js'

describe('SEO stuffing scrub (ZAV-228)', () => {
  it('drops the news tail but keeps the topic words', () => {
    expect(scrubSeoPhrases('Microsoft layoffs news: 6,000 jobs cut')).toBe('Microsoft layoffs: 6,000 jobs cut')
    expect(scrubSeoPhrases('Pakistan cricket news as Babar returns')).toBe('Pakistan cricket as Babar returns')
  })
  it('removes "news today" and softens "live match"', () => {
    expect(scrubSeoPhrases('Petrol price cut by Rs5 - news today')).toBe('Petrol price cut by Rs5')
    expect(scrubSeoPhrases('Watch the live match score')).toBe('Watch the match score')
  })
  it('leaves ordinary English alone', () => {
    for (const t of ['Good news for exporters', 'Breaking news: flood alert', 'The news channel was banned']) expect(scrubSeoPhrases(t)).toBe(t)
  })
  it('scrubs slugs', () => {
    expect(scrubSeoSlug('microsoft-layoffs-news-6000-jobs')).toBe('microsoft-layoffs-6000-jobs')
    expect(scrubSeoSlug('petrol-price-cut-news-today')).toBe('petrol-price-cut')
  })
  it('scrubs only the lede of the body', () => {
    const body = 'Microsoft layoffs news hit 6,000 staff.\n\n## Reaction\n\nThe layoffs news was met with anger.'
    expect(scrubLede(body)).toBe('Microsoft layoffs hit 6,000 staff.\n\n## Reaction\n\nThe layoffs news was met with anger.')
  })
  it('scrubs a whole draft and reports a change', () => {
    const part = {
      title: 'Pakistan cricket news today: win', titleOptions: ['A Pakistan cricket news headline here ok', 'Clean headline about the win in Lahore'],
      slug: 'pakistan-cricket-news-win', dek: 'Pakistan cricket news says the team won the match in Lahore on Monday evening.', bodyMarkdown: 'Pakistan won. '.repeat(3),
    }
    expect(scrubWriterCopy(part)).toBe(true)
    expect(part.title).toBe('Pakistan cricket: win')
    expect(part.slug).toBe('pakistan-cricket-win')
    expect(scrubWriterCopy(part)).toBe(false)
  })
  it('QA flags leftover phrases and repeated "X news" phrases', () => {
    expect(checkSeoStuffing('Rain hits Karachi, news today', 'Dek', 'Body.').join()).toMatch(/stuffing/)
    const rep = checkSeoStuffing('Microsoft layoffs news', 'Microsoft layoffs news update on staff cuts', 'Microsoft layoffs news came on Monday.')
    expect(rep.join()).toMatch(/stuffing/)
    expect(checkSeoStuffing('Microsoft cuts 6,000 jobs', 'Layoffs hit staff worldwide.', 'Microsoft said on Monday it will cut jobs.')).toEqual([])
    expect(checkSeoStuffing('Good news for exporters', 'Good news arrives', 'Good news today? No.')).not.toEqual([])
  })
})
