import { describe, expect, it } from 'vitest'
import { countFromLabel } from './x-dom'

describe('countFromLabel', () => {
  it('reads the counters X puts in aria-labels', () => {
    expect(countFromLabel('36924 views. View post analytics')).toBe(36924)
    expect(countFromLabel('85 Likes. Like')).toBe(85)
    expect(countFromLabel('1,204 Replies. Reply')).toBe(1204)
    expect(countFromLabel('1.2K views')).toBe(1200)
    expect(countFromLabel('3.5M views')).toBe(3_500_000)
  })
  it('gives nothing when there is no number', () => {
    expect(countFromLabel('Like')).toBeUndefined()
    expect(countFromLabel(null)).toBeUndefined()
    expect(countFromLabel('')).toBeUndefined()
  })
})
