/** Which story clusters the worker's stuck-approved sweep should look at (ZAV-107, ZAV-203). */

export type StuckCandidate = { id: string | number; status?: unknown; updatedAt?: unknown; triage?: unknown }

export const STUCK_PAGE_SIZE = 300
/** Upper bound on pages read per sweep; the sweep runs every 5 minutes so the rest is picked up next time. */
export const STUCK_MAX_PAGES = 10
export const STUCK_RESULT_LIMIT = 25

const ageMin = (c: StuckCandidate, now: number) => (now - new Date(String(c.updatedAt)).getTime()) / 60_000

/** True when this cluster is stuck and should be handed back to the writer. */
export function isStuckApproved(c: StuckCandidate, now: number, writingAgeMin: number, publishAgeMin: number): boolean {
  const triage = (c.triage ?? {}) as { editorApproved?: boolean; codeOutcome?: string }
  if (c.status === 'writing') return triage.editorApproved === true && ageMin(c, now) >= writingAgeMin
  if (triage.editorApproved === true) return true
  return c.status === 'triaged' && triage.codeOutcome === 'publish' && ageMin(c, now) >= publishAgeMin
}

/**
 * Reads pages (oldest update first) until enough stuck clusters are found. The filter cannot be part of the query
 * (triage is a JSON field), and hundreds of old clusters were left in 'writing' without editor approval; filtering
 * after a single page of 300 hid the approved ones behind them (ZAV-203: 12349 and 12363 sat for two days).
 */
export async function collectStuckApproved<T extends StuckCandidate>(
  findPage: (page: number) => Promise<{ docs: T[]; hasNextPage: boolean }>,
  now: number,
  writingAgeMin: number,
  publishAgeMin: number,
): Promise<T[]> {
  const out: T[] = []
  for (let page = 1; page <= STUCK_MAX_PAGES; page++) {
    const res = await findPage(page)
    for (const c of res.docs) {
      if (isStuckApproved(c, now, writingAgeMin, publishAgeMin)) out.push(c)
      if (out.length >= STUCK_RESULT_LIMIT) return out
    }
    if (!res.hasNextPage) break
  }
  return out
}
