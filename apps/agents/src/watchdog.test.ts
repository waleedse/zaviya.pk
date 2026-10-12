import { describe, expect, it } from 'vitest'
import { findProblems, isNewsHours, type Observation } from './watchdog.js'

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
