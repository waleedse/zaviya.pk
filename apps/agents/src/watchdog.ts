/**
 * Watchdog: plain code, no LLM. Every minute it checks the site, the worker heartbeat, the queues,
 * publishing and the Chrome extension. A failing check opens one Linear issue (label `incident`, or
 * `needs-waleed` when only Waleed can fix it), comments while it stays broken, and comments again
 * when it recovers. The engineer session on the Mac picks incidents up.
 */

export interface Heartbeat {
  at: number | null
  queues: Record<string, { waiting: number; active: number; failed: number }>
  extension: boolean | null
}

export interface Observation {
  siteStatus: number
  heartbeat: Heartbeat
  lastPublishedAt: number | null
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
  if (beatAge > 5 * MIN) {
    problems.push({
      key: 'worker-silent',
      title: 'Worker heartbeat stopped',
      detail: hb.at ? `Last heartbeat ${Math.round(beatAge / MIN)} min ago.` : 'No heartbeat recorded.',
      label: 'incident',
    })
  } else {
    for (const [name, q] of Object.entries(hb.queues)) {
      // Work waiting but nothing moving, for two checks in a row
      const before = prev?.heartbeat.queues[name]
      if (q.waiting > 200 && q.active === 0 && before && before.waiting <= q.waiting && before.active === 0) {
        problems.push({
          key: `queue-stuck-${name}`,
          title: `Queue "${name}" is stuck`,
          detail: `${q.waiting} jobs waiting, none active.`,
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

  if (isNewsHours(o.now) && o.lastPublishedAt && o.now - o.lastPublishedAt > 2 * 60 * MIN) {
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
