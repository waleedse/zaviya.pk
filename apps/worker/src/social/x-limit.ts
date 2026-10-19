/** X's own daily post limit (ZAV-123): once X says it is reached, stop trying until 00:00 PKT instead of failing every 15 minutes. */
const PKT_OFFSET_MS = 5 * 3_600_000

export function isXDailyLimit(message: string): boolean {
  return /daily (post )?limit|posting limit|limit for (the )?(number of )?posts/i.test(message)
}

/** The next 00:00 in Pakistan time (UTC+5, no DST), as epoch ms */
export function nextPktMidnight(now: number): number {
  const local = now + PKT_OFFSET_MS
  const dayStart = local - (((local % 86_400_000) + 86_400_000) % 86_400_000)
  return dayStart + 86_400_000 - PKT_OFFSET_MS
}

let blockedUntil = 0

export function xPostingBlocked(now = Date.now()): boolean {
  return now < blockedUntil
}

export function blockXUntilMidnight(now = Date.now()): number {
  blockedUntil = nextPktMidnight(now)
  return blockedUntil
}

/** Test helper */
export function resetXBlock(): void {
  blockedUntil = 0
}
