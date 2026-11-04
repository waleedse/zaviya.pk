import { describe, expect, it } from 'vitest'
import { DISCOVER_MIN_WIDTH, discoverImage, isMediaSrc } from '../../src/lib/hero-image'
import { articleShareImage, baseRobots } from '../../src/lib/seo'
import type { ArticleCard } from '@zaviya/shared'

describe('Discover images are at least 1200 px wide', () => {
  it('serves a 1024 px photo through the enlarging route at 1280 px', () => {
    const img = discoverImage({ url: '/api/media/file/a.png', width: 1024, height: 572 })!
    expect(img.enlarged).toBe(true)
    expect(img.width).toBeGreaterThanOrEqual(DISCOVER_MIN_WIDTH)
    expect(img.url).toBe('/api/hero-image?src=%2Fapi%2Fmedia%2Ffile%2Fa.png')
    expect(img.height).toBe(715)
  })
  it('leaves wide photos and external images alone', () => {
    expect(discoverImage({ url: '/api/media/file/b.jpg', width: 1600, height: 900 })).toMatchObject({ url: '/api/media/file/b.jpg', enlarged: false })
    expect(discoverImage({ url: 'https://cdn.example.com/x.jpg', width: 800, height: 450 })!.enlarged).toBe(false)
    expect(discoverImage(undefined)).toBeUndefined()
  })
  it('the enlarging route only accepts our own media files', () => {
    expect(isMediaSrc('/api/media/file/a-1.png')).toBe(true)
    expect(isMediaSrc('https://evil.example/x.png')).toBe(false)
    expect(isMediaSrc('/api/media/file/../../etc/passwd')).toBe(false)
    expect(isMediaSrc('/api/other')).toBe(false)
  })
  it('og:image size reported for a narrow hero is the enlarged size', () => {
    const article = { image: { url: '/api/media/file/a.png', width: 1024, height: 572, alt: '' }, title: 't', category: { slug: 'pakistan', name: 'Pakistan', color: '#000' } } as unknown as ArticleCard
    const share = articleShareImage(article)
    expect(share.url).toContain('/api/hero-image')
    expect(share.size!.width).toBeGreaterThanOrEqual(1200)
  })
  it('robots allow large image previews', () => {
    const r = baseRobots() as Record<string, unknown>
    expect(r['max-image-preview']).toBe('large')
  })
})
