import { describe, expect, it } from 'vitest'
import { paginate } from '../../src/proxy'
import { isThinTag, LATEST_PAGE_SIZE, MIN_INDEXABLE_TAG_STORIES } from '../../src/lib/tag-rules'

const run = (path: string) => {
  const url = new URL(`https://zaviya.pk${path}`)
  paginate(url)
  return url.pathname + url.search
}

describe('?page=n rewrite keeps listing pages cacheable (ZAV-221)', () => {
  it('rewrites category, latest and tag pages to /page/n', () => {
    expect(run('/en/pakistan?page=3')).toBe('/en/pakistan/page/3')
    expect(run('/en/latest?page=2')).toBe('/en/latest/page/2')
    expect(run('/en/tag/karachi?page=2')).toBe('/en/tag/karachi/page/2')
    expect(run('/ur/tag/karachi?page=4')).toBe('/ur/tag/karachi/page/4')
  })
  it('leaves page 1, junk values and article URLs alone', () => {
    expect(run('/en/tag/karachi')).toBe('/en/tag/karachi')
    expect(run('/en/tag/karachi?page=1')).toBe('/en/tag/karachi?page=1')
    expect(run('/en/tag/karachi?page=abc')).toBe('/en/tag/karachi?page=abc')
    expect(run('/en/pakistan/some-article?page=2')).toBe('/en/pakistan/some-article?page=2')
  })
})

describe('thin tags', () => {
  it('a tag with fewer than 3 stories is thin (noindex, not linked from articles)', () => {
    expect(MIN_INDEXABLE_TAG_STORIES).toBe(3)
    expect(isThinTag(2)).toBe(true)
    expect(isThinTag(3)).toBe(false)
  })
  it('the latest list is 50 headlines per page', () => {
    expect(LATEST_PAGE_SIZE).toBe(50)
  })
})
