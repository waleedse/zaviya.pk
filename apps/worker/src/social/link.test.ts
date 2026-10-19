import { describe, expect, it } from 'vitest'
import { articleUrl, captionWithoutLink, limitHashtags, pickCard, withLink } from './link.js'

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

  it('prefers the designed post card on every platform', () => {
    const media = ['https://zaviya.pk/api/media/file/a-portrait.png', 'https://zaviya.pk/api/media/file/a-post.png', 'https://zaviya.pk/api/media/file/a-card.png']
    for (const p of ['facebook', 'instagram', 'x'] as const) expect(pickCard(media, p)).toBe(media[1])
  })
})

describe('first-comment helpers (ZAV-111)', () => {
  const url = 'https://zaviya.pk/business/petrol-price-cut'
  it('keeps the first hashtags only', () => {
    expect(limitHashtags('Petrol cut #Petrol #Pakistan #Economy #News', 2)).toBe('Petrol cut #Petrol #Pakistan')
    expect(limitHashtags('no tags here', 3)).toBe('no tags here')
    expect(limitHashtags('A #one\n\nB #two #three', 3)).toBe('A #one\n\nB #two #three')
  })
  it('strips the link and the read-more line from the caption', () => {
    expect(captionWithoutLink(`Petrol cut. Will it last?\n\nRead the full story: ${url}`, url)).toBe('Petrol cut. Will it last?')
    expect(captionWithoutLink(`Petrol cut ${url} more`, url)).toBe('Petrol cut  more')
  })
})
