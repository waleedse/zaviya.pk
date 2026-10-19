import { describe, expect, it } from 'vitest'
import type { ArticleFull } from '@zaviya/shared'
import { buildWebStoryHtml, storyPosterUrl, STORY_POSTER_HEIGHT, STORY_POSTER_WIDTH } from '@/lib/web-story'

const base = {
  title: 'A story',
  dek: 'Dek',
  keyPoints: ['one'],
  category: { slug: 'news', name: 'News' },
  image: { url: '/api/media/file/hero.jpg' },
} as unknown as ArticleFull

describe('web story poster (ZAV-127)', () => {
  it('uses an absolute portrait poster cropped from the hero', () => {
    const url = storyPosterUrl(base)
    expect(url).toMatch(/^https?:\/\/.+\/api\/story-poster\?src=%2Fapi%2Fmedia%2Ffile%2Fhero\.jpg$/)
  })
  it('falls back to a portrait generated card with no hero', () => {
    const url = storyPosterUrl({ ...base, image: null } as unknown as ArticleFull)
    expect(url).toMatch(/^https?:\/\/.+\/api\/og\?.*variant=story/)
  })
  it('declares the real 3:4 size on the cover and an absolute poster-portrait-src', () => {
    const html = buildWebStoryHtml(base, 'en', '/news/a-story')
    expect(STORY_POSTER_WIDTH / STORY_POSTER_HEIGHT).toBeCloseTo(0.75)
    expect(STORY_POSTER_WIDTH).toBeGreaterThanOrEqual(640)
    expect(STORY_POSTER_HEIGHT).toBeGreaterThanOrEqual(853)
    expect(html).toContain(`width="${STORY_POSTER_WIDTH}" height="${STORY_POSTER_HEIGHT}"`)
    expect(html).not.toContain('height="1280"')
    expect(html).toMatch(/poster-portrait-src="https?:\/\//)
  })
})
