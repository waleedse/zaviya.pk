/**
 * Watchdog: plain code, no LLM. Every minute it checks the site, the worker heartbeat, the queues,
 * publishing and the Chrome extension. A failing check opens one Linear issue (label `incident`, or
 * `needs-waleed` when only Waleed can fix it), comments while it stays broken, and comments again
 * when it recovers. The engineer session on the Mac picks incidents up.
 */

export interface Heartbeat {
  at: number | null
  queues: Record<string, { waiting: number; delayed?: number; active: number; failed: number }>
  extension: boolean | null
}

export interface Observation {
  siteStatus: number
  heartbeat: Heartbeat
  lastPublishedAt: number | null
  /** Percent of the root disk in use; null when it could not be read */
  diskUsedPct?: number | null
  /**
   * False when the authenticated Payload call (settings global) timed out or failed, so the heartbeat and
   * latest-article values are unknown. Absent counts as true (older callers and tests).
   */
  apiOk?: boolean
  now: number
}

export interface Problem {
  key: string
  title: string
  detail: string
  /** `incident` for the engineer, `needs-waleed` when it needs a human (e.g. Chrome on the Mac) */
  label: 'incident' | 'needs-waleed'
}

const MIN = 60_000
export const DISK_ALERT_PCT = 85

/** Daytime in Pakistan (07:00-01:00), when a quiet newsroom is a problem */
export function isNewsHours(now: number): boolean {
  const hour = new Date(now + 5 * 60 * MIN).getUTCHours()
  return hour >= 7 || hour < 1
}

export function findProblems(o: Observation, prev?: Observation): Problem[] {
  const problems: Problem[] = []

  if (o.siteStatus !== 200) {
    problems.push({
      key: 'site-down',
      title: 'zaviya.pk is not responding with 200',
      detail: `Homepage returned ${o.siteStatus || 'no response'}.`,
      label: 'incident',
    })
  }

  const hb = o.heartbeat
  const beatAge = hb.at ? o.now - hb.at : Infinity
  if (o.apiOk === false) {
    // ZAV-169: the web process answered the homepage but authenticated Payload calls hung. The heartbeat
    // is unknown then, so do not blame the worker (that opened a new "heartbeat stopped" issue per flap).
    problems.push({
      key: 'api-hung',
      title: 'Payload API is not answering authenticated calls',
      detail:
        'The authenticated settings call timed out or failed while the homepage may still answer. The heartbeat and queue state are unknown. ' +
        'Check the web container: heap use (JavaScript heap out of memory in docker logs), DB pool, nginx 504s.',
      label: 'incident',
    })
  } else if (beatAge > 5 * MIN) {
    problems.push({
      key: 'worker-silent',
      title: 'Worker heartbeat stopped',
      detail: hb.at ? `Last heartbeat ${Math.round(beatAge / MIN)} min ago.` : 'No heartbeat recorded.',
      label: 'incident',
    })
  } else {
    for (const [name, q] of Object.entries(hb.queues)) {
      // Work waiting but nothing moving, for two checks in a row
      // Delayed jobs (e.g. scheduled social posts) are not stuck, they are just not due yet
      const before = prev?.heartbeat.queues[name]
      const ready = q.waiting - (q.delayed ?? 0)
      const readyBefore = before ? before.waiting - (before.delayed ?? 0) : 0
      if (ready > 200 && q.active === 0 && before && readyBefore <= ready && before.active === 0) {
        problems.push({
          key: `queue-stuck-${name}`,
          title: `Queue "${name}" is stuck`,
          detail: `${ready} jobs waiting, none active.`,
          label: 'incident',
        })
      }
      if (before && q.failed - before.failed >= 25) {
        problems.push({
          key: `queue-failing-${name}`,
          title: `Queue "${name}" is failing`,
          detail: `${q.failed - before.failed} new failed jobs in the last check (total ${q.failed}).`,
          label: 'incident',
        })
      }
    }
    if (hb.extension === false) {
      problems.push({
        key: 'extension-offline',
        title: 'Chrome extension is offline',
        detail: 'Gemini images and X/Instagram discovery need Chrome open on the Mac with the Zaviya extension connected to wss://zaviya.pk/bridge.',
        label: 'needs-waleed',
      })
    }
  }

  if (o.diskUsedPct != null && o.diskUsedPct > DISK_ALERT_PCT) {
    problems.push({
      key: 'disk-high',
      title: `Server disk is ${Math.round(o.diskUsedPct)}% full`,
      detail: `Root disk above ${DISK_ALERT_PCT}%. At 100% Redis refuses writes (MISCONF) and jobs are lost. Check old release images and build cache (docker system df); never remove the running or rollback tag.`,
      label: 'incident',
    })
  }

  if (o.apiOk !== false && isNewsHours(o.now) && o.lastPublishedAt && o.now - o.lastPublishedAt > 2 * 60 * MIN) {
    problems.push({
      key: 'no-articles',
      title: 'No article published for 2 hours',
      detail: `Last article published ${Math.round((o.now - o.lastPublishedAt) / MIN)} min ago, during news hours.`,
      label: 'incident',
    })
  }

  return problems
}

/** A problem must be seen on this many consecutive checks before it is reported (no flapping alerts). */
export const CONFIRM_CHECKS: Record<string, number> = { 'site-down': 2, 'extension-offline': 30 }
export const DEFAULT_CONFIRM_CHECKS = 3

/** A problem must be clear for this many consecutive checks before it counts as recovered (no recover/reopen flapping). */
export const RECOVER_CHECKS = 5
/** A problem that returns within this long of recovering reuses its issue instead of opening a new one. */
export const REOPEN_WINDOW_MS = 12 * 60 * MIN
/** Reminder comments on an open issue are at most this often. */
export const NOTE_EVERY_MS = 60 * MIN

export interface Tracked {
  count: number
  issue?: string
  lastNote?: number
  /** Consecutive checks since the problem was last seen (only while an issue is open) */
  clean?: number
  problem: Problem
}

export interface Resolved {
  issue: string
  at: number
}

export interface WatchdogState {
  tracked: Record<string, Tracked>
  /** Recently recovered problems, kept so a recurrence reuses the issue */
  resolved: Record<string, Resolved>
}

export type WatchdogAction =
  | { type: 'open'; key: string; problem: Problem; firstSeen: number }
  | { type: 'reopen'; key: string; problem: Problem; issue: string }
  | { type: 'note'; key: string; problem: Problem; issue: string; count: number }
  | { type: 'recovered'; key: string; problem: Problem; issue: string }

/**
 * Pure bookkeeping for the watchdog (ZAV-169): ONE issue per outage. A problem opens an issue after its
 * confirm count; while it stays broken it only adds an hourly note; a blip of clean checks does not end the
 * outage (RECOVER_CHECKS in a row do); and a problem that comes back within REOPEN_WINDOW_MS reuses the
 * same issue. The caller executes the actions and, when `open` fails to produce an issue id, may drop it.
 */
export function planWatchdog(
  prev: WatchdogState,
  problems: Problem[],
  now: number,
): { actions: WatchdogAction[]; state: WatchdogState } {
  const actions: WatchdogAction[] = []
  const tracked: Record<string, Tracked> = { ...prev.tracked }
  const resolved: Record<string, Resolved> = {}
  for (const [k, r] of Object.entries(prev.resolved)) if (now - r.at <= REOPEN_WINDOW_MS) resolved[k] = r
  const seen = new Set(problems.map((p) => p.key))

  for (const p of problems) {
    const t: Tracked = { ...(tracked[p.key] ?? { count: 0, problem: p }), problem: p, clean: 0 }
    t.count++
    const confirmAfter = CONFIRM_CHECKS[p.key] ?? DEFAULT_CONFIRM_CHECKS
    if (!t.issue && t.count >= confirmAfter) {
      const old = resolved[p.key]
      if (old) {
        t.issue = old.issue
        t.lastNote = now
        delete resolved[p.key]
        actions.push({ type: 'reopen', key: p.key, problem: p, issue: old.issue })
      } else {
        t.lastNote = now
        actions.push({ type: 'open', key: p.key, problem: p, firstSeen: now - (t.count - 1) * MIN })
      }
    } else if (t.issue && now - (t.lastNote ?? 0) > NOTE_EVERY_MS) {
      t.lastNote = now
      actions.push({ type: 'note', key: p.key, problem: p, issue: t.issue, count: t.count })
    }
    tracked[p.key] = t
  }

  for (const [key, t] of Object.entries(tracked)) {
    if (seen.has(key)) continue
    if (!t.issue) {
      // Never confirmed: forget it
      delete tracked[key]
      continue
    }
    const clean = (t.clean ?? 0) + 1
    if (clean >= RECOVER_CHECKS) {
      actions.push({ type: 'recovered', key, problem: t.problem, issue: t.issue })
      resolved[key] = { issue: t.issue, at: now }
      delete tracked[key]
    } else {
      tracked[key] = { ...t, clean }
    }
  }
  return { actions, state: { tracked, resolved } }
}
