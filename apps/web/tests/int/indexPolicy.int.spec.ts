import { describe, expect, it } from 'vitest'
import { countWords, storyNoindex } from '@/lib/index-policy'

describe('story index policy (5 Nov: quality over volume)', () => {
  const strong = { category: 'pakistan', priority: 'normal', sourceCount: 2, words: 450 }

  it('indexes jobs and cricket stories always', () => {
    expect(storyNoindex({ category: 'education-jobs', priority: 'normal', sourceCount: 1, words: 120 })).toBe(false)
    expect(storyNoindex({ category: 'cricket', priority: 'normal', sourceCount: 1, words: 120 })).toBe(false)
  })

  it('indexes high and breaking stories on any desk', () => {
    expect(storyNoindex({ category: 'world', priority: 'high', sourceCount: 1, words: 200 })).toBe(false)
    expect(storyNoindex({ category: 'ai', priority: 'breaking', sourceCount: 1, words: 200 })).toBe(false)
  })

  it('indexes a Pakistan or business story with two sources and depth', () => {
    expect(storyNoindex(strong)).toBe(false)
    expect(storyNoindex({ ...strong, category: 'business' })).toBe(false)
  })

  it('noindexes a single-source or short Pakistan rewrite', () => {
    expect(storyNoindex({ ...strong, sourceCount: 1 })).toBe(true)
    expect(storyNoindex({ ...strong, words: 300 })).toBe(true)
  })

  it('noindexes normal world, ai and tech rewrites', () => {
    for (const category of ['world', 'ai', 'tech-telecom', 'sports', 'trending']) {
      expect(storyNoindex({ ...strong, category, sourceCount: 5, words: 900 })).toBe(true)
    }
  })

  it('counts words in markdown', () => {
    expect(countWords('  one two\n\nthree ')).toBe(3)
    expect(countWords('')).toBe(0)
  })
})
