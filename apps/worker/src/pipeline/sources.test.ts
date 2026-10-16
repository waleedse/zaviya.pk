import { describe, it, expect } from 'vitest'
import { articleSources, isOutletUrl } from './publish.js'

describe('article sources', () => {
  it('drops Google News wrappers and social posts', () => {
    expect(isOutletUrl('https://news.google.com/rss/articles/abc')).toBe(false)
    expect(isOutletUrl('https://x.com/user/status/1')).toBe(false)
    expect(isOutletUrl('https://www.instagram.com/reel/abc/')).toBe(false)
    expect(isOutletUrl('https://www.dawn.com/news/2037627')).toBe(true)
    expect(isOutletUrl('not a url')).toBe(false)
  })
  it('keeps only outlet pages', () => {
    const items = [{ url: 'https://news.google.com/x' }, { url: 'https://www.dawn.com/news/1' }, { url: 'https://x.com/a/status/2' }]
    expect(articleSources(items)).toEqual([{ url: 'https://www.dawn.com/news/1' }])
  })
  it('falls back to all items when none is an outlet page', () => {
    const items = [{ url: 'https://news.google.com/x' }]
    expect(articleSources(items)).toEqual(items)
  })
})
