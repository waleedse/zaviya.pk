import { describe, expect, it } from 'vitest'
import { keepHeroImage } from '../../src/hooks/articles'

const run = (data: Record<string, unknown>, originalDoc: Record<string, unknown> | undefined) =>
  keepHeroImage({ data, originalDoc } as never) as Record<string, unknown>

describe('keepHeroImage', () => {
  it('keeps the image when an edit sends it empty', () => {
    expect(run({ heroImage: null }, { heroImage: 12 }).heroImage).toBe(12)
  })
  it('keeps the image when the current one is populated', () => {
    expect(run({ heroImage: null }, { heroImage: { id: 12 } }).heroImage).toBe(12)
  })
  it('turns a populated object into its id', () => {
    expect(run({ heroImage: { id: 5 } }, { heroImage: 12 }).heroImage).toBe(5)
  })
  it('never lets an edit remove the image', () => {
    expect(run({ heroImage: undefined }, { heroImage: 12 }).heroImage).toBe(12)
  })
  it('leaves edits that do not mention the image alone', () => {
    expect('heroImage' in run({ title: 'x' }, { heroImage: 12 })).toBe(false)
  })
})
