import { afterEach, describe, expect, it } from 'vitest'
import { blockXUntilMidnight, isXDailyLimit, nextPktMidnight, resetXBlock, xPostingBlocked } from './x-limit.js'

describe('X daily limit', () => {
  afterEach(resetXBlock)
  it('recognises the messages X and the extension report', () => {
    expect(isXDailyLimit('post_not_sent: composer still open after clicking Post twice | needs you: Daily post limit reached on X account.')).toBe(true)
    expect(isXDailyLimit('needs you: The account has hit the daily post limit set by X.')).toBe(true)
    expect(isXDailyLimit('composer_not_found')).toBe(false)
  })
  it('midnight PKT is 19:00 UTC', () => {
    expect(new Date(nextPktMidnight(Date.parse('2026-10-18T14:29:00Z'))).toISOString()).toBe('2026-10-18T19:00:00.000Z')
    expect(new Date(nextPktMidnight(Date.parse('2026-10-18T19:30:00Z'))).toISOString()).toBe('2026-10-19T19:00:00.000Z')
  })
  it('blocks until then and no longer', () => {
    const t = Date.parse('2026-10-18T14:29:00Z')
    blockXUntilMidnight(t)
    expect(xPostingBlocked(t + 3_600_000)).toBe(true)
    expect(xPostingBlocked(Date.parse('2026-10-18T19:00:01Z'))).toBe(false)
  })
})
