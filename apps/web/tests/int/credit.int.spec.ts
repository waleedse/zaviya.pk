import { describe, expect, it } from 'vitest'
import { creditParts } from '@/lib/credit'

describe('creditParts', () => {
  it('splits a Commons credit into text and the file page link', () => {
    expect(creditParts('Photo: Martin Falbisoner / CC BY-SA 3.0 / Wikimedia Commons | https://commons.wikimedia.org/wiki/File:US_Capitol_east_side.JPG')).toEqual({
      text: 'Photo: Martin Falbisoner / CC BY-SA 3.0 / Wikimedia Commons',
      href: 'https://commons.wikimedia.org/wiki/File:US_Capitol_east_side.JPG',
    })
  })
  it('leaves plain credits alone and never links elsewhere', () => {
    expect(creditParts('Zaviya (AI illustration)')).toEqual({ text: 'Zaviya (AI illustration)', href: undefined })
    expect(creditParts('Photo: X | https://evil.example/File:a.jpg').href).toBeUndefined()
  })
})
