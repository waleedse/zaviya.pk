import { describe, expect, it } from 'vitest'
import { findProblems, isNewsHours, planWatchdog, RECOVER_CHECKS, type Observation, type WatchdogState } from './watchdog.js'

const now = Date.parse('2026-10-12T07:00:00Z') // 12:00 PKT
const healthy: Observation = {
  siteStatus: 200,
  heartbeat: { at: now - 20_000, queues: { write: { waiting: 3, active: 1, failed: 2 } }, extension: true },
  lastPublishedAt: now - 20 * 60_000,
  now,
}

describe('watchdog', () => {
  it('is quiet when everything is fine', () => {
    expect(findProblems(healthy, healthy)).toEqual([])
  })

  it('flags a down site and a silent worker', () => {
    const o = { ...healthy, siteStatus: 502, heartbeat: { ...healthy.heartbeat, at: now - 10 * 60_000 } }
    expect(findProblems(o).map((p) => p.key)).toEqual(['site-down', 'worker-silent'])
  })

  it('flags a stuck queue only when it was stuck on the previous check too', () => {
    const stuck = { ...healthy, heartbeat: { ...healthy.heartbeat, queues: { embed: { waiting: 500, active: 0, failed: 0 } } } }
    expect(findProblems(stuck, healthy).map((p) => p.key)).toEqual([])
    expect(findProblems(stuck, stuck).map((p) => p.key)).toEqual(['queue-stuck-embed'])
  })

  it('ignores a queue whose backlog is only delayed jobs', () => {
    const q = { social: { waiting: 321, delayed: 321, active: 0, failed: 0 } }
    const delayed = { ...healthy, heartbeat: { ...healthy.heartbeat, queues: q } }
    expect(findProblems(delayed, delayed).map((p) => p.key)).toEqual([])
  })

  it('flags a nearly full disk', () => {
    expect(findProblems({ ...healthy, diskUsedPct: 80 }).map((p) => p.key)).toEqual([])
    expect(findProblems({ ...healthy, diskUsedPct: 91 }).map((p) => p.key)).toEqual(['disk-high'])
  })

  it('flags a burst of failures and an offline extension for Waleed', () => {
    const o = { ...healthy, heartbeat: { ...healthy.heartbeat, queues: { write: { waiting: 3, active: 1, failed: 40 } }, extension: false } }
    const problems = findProblems(o, healthy)
    expect(problems.map((p) => p.key)).toEqual(['queue-failing-write', 'extension-offline'])
    expect(problems[1]!.label).toBe('needs-waleed')
  })

  it('only expects articles during news hours', () => {
    const quiet = { ...healthy, lastPublishedAt: now - 3 * 60 * 60_000 }
    expect(findProblems(quiet).map((p) => p.key)).toEqual(['no-articles'])
    const night = Date.parse('2026-10-11T23:00:00Z') // 04:00 PKT
    expect(isNewsHours(night)).toBe(false)
    expect(findProblems({ ...quiet, now: night, heartbeat: { ...quiet.heartbeat, at: night } })).toEqual([])
  })
})

describe('planWatchdog (one issue per outage)', () => {
  const p = { key: 'api-hung', title: 'Payload API is not answering authenticated calls', detail: 'd', label: 'incident' as const }
  const empty: WatchdogState = { tracked: {}, resolved: {} }
  const t0 = Date.parse('2026-10-22T04:00:00Z')
  const min = 60_000
  /** Runs the plan over a series of checks: true = problem present */
  function run(series: boolean[], start = empty, from = t0) {
    let state = start
    const all: string[] = []
    series.forEach((bad, i) => {
      const r = planWatchdog(state, bad ? [p] : [], from + i * min)
      state = r.state
      // The caller records the id of the issue it opened
      for (const a of r.actions) if (a.type === 'open') state.tracked[a.key]!.issue = 'ZAV-1'
      all.push(...r.actions.map((a) => a.type))
    })
    return { state, all }
  }

  it('opens one issue after the confirm count, then only hourly notes', () => {
    const { all } = run(Array(130).fill(true))
    expect(all.filter((a) => a === 'open')).toHaveLength(1)
    expect(all.filter((a) => a === 'note')).toHaveLength(2)
  })

  it('a short clean blip does not end the outage or open a second issue', () => {
    const { all } = run([true, true, true, false, false, true, true, true, true])
    expect(all).toEqual(['open'])
  })

  it('recovers after RECOVER_CHECKS clean checks and reuses the issue when it returns within 12 h', () => {
    const first = run([true, true, true, ...Array(RECOVER_CHECKS).fill(false)])
    expect(first.all).toEqual(['open', 'recovered'])
    const again = run([true, true, true], first.state, t0 + 3 * 60 * min)
    expect(again.all).toEqual(['reopen'])
    expect(again.state.tracked['api-hung']!.issue).toBe('ZAV-1')
  })

  it('opens a new issue when the old one is older than the reopen window', () => {
    const first = run([true, true, true, ...Array(RECOVER_CHECKS).fill(false)])
    const late = run([true, true, true], first.state, t0 + 14 * 60 * min)
    expect(late.all).toEqual(['open'])
  })

  it('ten flaps in a night produce one issue', () => {
    let series: boolean[] = []
    for (let i = 0; i < 10; i++) series = series.concat([true, true, true, ...Array(RECOVER_CHECKS).fill(false), ...Array(20).fill(false)])
    const { all } = run(series)
    expect(all.filter((a) => a === 'open')).toHaveLength(1)
    expect(all.filter((a) => a === 'reopen')).toHaveLength(9)
  })
})

describe('api-hung', () => {
  it('reports a hung API instead of a silent worker', () => {
    const o = { ...healthy, apiOk: false, heartbeat: { at: null, queues: {}, extension: null }, lastPublishedAt: null }
    expect(findProblems(o).map((x) => x.key)).toEqual(['api-hung'])
  })
})
