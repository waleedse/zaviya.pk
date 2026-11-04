import { describe, expect, it } from 'vitest'
import { activeClosures, closureState, closureTomorrow, matchVacationLinks, vacationText, VACATION_REGIONS, type ClosureView } from '../../src/lib/vacations'

const c = (over: Partial<ClosureView>): ClosureView => ({ region: 'punjab', scope: 'Lahore division', date: '2026-11-05', reason: 'smog', status: 'announced', sourceNote: 'notice', ...over })

describe('winter vacations and closures', () => {
  it('covers each province and Islamabad', () => {
    expect(VACATION_REGIONS.map((r) => r.slug)).toEqual(['punjab', 'sindh', 'kp', 'balochistan', 'islamabad'])
  })
  it('shows "Not announced yet" until there is a date', () => {
    expect(vacationText({ status: 'not_announced' })).toBe('Not announced yet')
    expect(vacationText({ status: 'notified', startDate: '2026-12-24', endDate: '2027-01-08' })).toBe('24 December 2026 to 8 January 2027')
    expect(vacationText({ status: 'reported', startDate: '2026-12-24', endDate: '2027-01-08' })).toMatch(/not yet officially notified/)
  })
  it('classifies closures against today', () => {
    expect(closureState(c({ date: '2026-11-04' }), '2026-11-04')).toBe('today')
    expect(closureState(c({ date: '2026-11-05' }), '2026-11-04')).toBe('tomorrow')
    expect(closureState(c({ date: '2026-11-09' }), '2026-11-04')).toBe('upcoming')
    expect(closureState(c({ date: '2026-11-01' }), '2026-11-04')).toBe('past')
    expect(closureState(c({ date: '2026-11-01', endDate: '2026-11-06' }), '2026-11-04')).toBe('today')
    expect(closureState(c({ status: 'cancelled' }), '2026-11-04')).toBe('cancelled')
  })
  it('lists active closures soonest first and finds the ones covering tomorrow', () => {
    const list = [c({ date: '2026-11-09', scope: 'B' }), c({ date: '2026-11-05', scope: 'A' }), c({ date: '2026-11-01', scope: 'old' }), c({ date: '2026-11-03', endDate: '2026-11-05', scope: 'C' })]
    expect(activeClosures(list, '2026-11-04').map((x) => x.scope)).toEqual(['C', 'A', 'B'])
    expect(closureTomorrow(list, '2026-11-04').map((x) => x.scope).sort()).toEqual(['A', 'C'])
    expect(closureTomorrow([], '2026-11-04')).toEqual([])
  })
  it('links stories about winter breaks and closures', () => {
    expect(matchVacationLinks('Punjab announces winter vacations from December')[0]!.href).toBe('/winter-vacations-2026-27/punjab')
    expect(matchVacationLinks('KPK winter holidays schedule').some((l) => l.href.endsWith('/kp'))).toBe(true)
    expect(matchVacationLinks('Schools closed tomorrow in Lahore due to smog')[0]!.href).toBe('/school-closed-tomorrow-pakistan')
    expect(matchVacationLinks('SBP cuts policy rate')).toEqual([])
  })
})
