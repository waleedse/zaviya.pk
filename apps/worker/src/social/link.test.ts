import { describe, expect, it } from 'vitest'
import { articleUrl, pickCard, withLink } from './link.js'

describe('social links', () => {
  const url = articleUrl('business', 'petrol-price-cut', 'https://zaviya.pk')

  it('builds the canonical article url', () => {
    expect(url).toBe('https://zaviya.pk/business/petrol-price-cut')
  })

  it('adds the link once per platform', () => {
    expect(withLink('Petrol cut', url, 'x')).toBe(`Petrol cut ${url}`)
    expect(withLink(`Petrol cut ${url}`, url, 'x')).toBe(`Petrol cut ${url}`)
    expect(withLink('Petrol cut', url, 'facebook')).toContain(`Read the full story: ${url}`)
    expect(withLink('Petrol cut', url, 'instagram')).toContain('link in bio')
    expect(withLink('Petrol cut', undefined, 'x')).toBe('Petrol cut')
  })

  it('picks the wide card for feeds and the portrait for Instagram', () => {
    const media = ['https://zaviya.pk/api/media/file/a-portrait.png', 'https://zaviya.pk/api/media/file/a-card.png']
    expect(pickCard(media, 'facebook')).toBe(media[1])
    expect(pickCard(media, 'x')).toBe(media[1])
    expect(pickCard(media, 'instagram')).toBe(media[0])
  })
})
