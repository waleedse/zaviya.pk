import { describe, expect, it } from 'vitest'
import { finalizeCopy, pickHashtags, stripHashtags, toHashtag } from './hashtags.js'

describe('hashtags', () => {
  it('camel-cases entities and drops generic or non-latin ones', () => {
    expect(toHashtag('State Bank of Pakistan')).toBe('#StateBankOfPakistan')
    expect(toHashtag('news')).toBeNull()
    expect(toHashtag('پیٹرول')).toBeNull()
  })

  it('never exceeds three, puts headline topics first and the brand last', () => {
    const tags = pickHashtags({ tags: ['IMF', 'Petrol', 'OGRA', 'Karachi'], category: 'business', title: 'Petrol price cut by Rs5 from Friday' })
    expect(tags.length).toBeLessThanOrEqual(3)
    expect(tags[0]).toBe('#Petrol')
    expect(tags.at(-1)).toBe('#Zaviya')
    expect(new Set(tags.map((t) => t.toLowerCase())).size).toBe(tags.length)
  })

  it('replaces the writer hashtags with the controlled set', () => {
    expect(stripHashtags('Big news #a #b\nmore')).toBe('Big news\nmore')
    const out = finalizeCopy({ facebook: 'f #x', instagram: 'i #1 #2 #3 #4 #5 #6 #7', x: 'x text #y' }, { tags: ['IMF'], category: 'business', title: 'IMF loan' })
    expect(out.instagram.match(/#\w+/g)!.length).toBeLessThanOrEqual(3)
    expect(out.instagram).not.toContain('#7')
    expect(out.x).toContain('#IMF')
  })
})
