import { describe, expect, it } from 'vitest'
import { categoryWeight } from '@/lib/learning'

describe('categoryWeight (learned triage weight per desk)', () => {
  it('rewards desks Pakistani readers actually read, up to 1.5', () => {
    // 12 Nov data: education-jobs 1.12 views/article vs a 0.12 site average
    expect(categoryWeight(1.12, 0.12)).toBe(1.5)
  })
  it('pushes desks nobody reads down to 0.6', () => {
    // world 0.01 views/article
    expect(categoryWeight(0.01, 0.12)).toBe(0.6)
  })
  it('keeps an average desk near 1', () => {
    expect(categoryWeight(0.12, 0.12)).toBe(1)
  })
  it('is neutral with no data', () => {
    expect(categoryWeight(0, 0)).toBe(1)
  })
})
