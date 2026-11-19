import { describe, expect, it } from 'vitest'
import { LIMIT_PATTERN, parseReset } from './engines.js'

describe('engine limits', () => {
  it('recognises the Claude weekly-limit message (it was missed on 19 Nov)', () => {
    expect(LIMIT_PATTERN.test("You've hit your weekly limit · resets 7am (UTC)")).toBe(true)
    expect(LIMIT_PATTERN.test('You’ve hit your usage limit')).toBe(true)
    expect(LIMIT_PATTERN.test('Approved 4 stories, rejected 2 duplicates. Next: check the petrol lead.')).toBe(false)
  })
  it('reads "resets 7am (UTC)" as the next 07:00 UTC', () => {
    const at0300 = Date.parse('2026-11-19T03:08:00Z')
    expect(parseReset("You've hit your weekly limit · resets 7am (UTC)", at0300)).toBe(Date.parse('2026-11-19T07:00:00Z'))
    const at0800 = Date.parse('2026-11-19T08:00:00Z')
    expect(parseReset('limit · resets 7am (UTC)', at0800)).toBe(Date.parse('2026-11-20T07:00:00Z'))
    expect(parseReset('limit · resets 7:30pm (UTC)', at0300)).toBe(Date.parse('2026-11-19T19:30:00Z'))
  })
  it('still reads the older reset formats', () => {
    expect(parseReset('limit reached|1794800000')).toBe(1794800000 * 1000)
    expect(parseReset('until 2026-11-19T08:38:47.443Z')).toBe(Date.parse('2026-11-19T08:38:47.443Z'))
    expect(parseReset('no time here')).toBeNull()
  })
})
