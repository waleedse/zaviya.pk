import { describe, it, expect } from 'vitest'
import { findSameStory, isSameEvent, type RecentArticle } from './same-story.js'

const NOW = new Date('2026-10-19T23:00:00Z').getTime()
const art = (id: string, title: string, publishedAt: string, extra: Partial<RecentArticle> = {}): RecentArticle => ({
  id,
  title,
  publishedAt,
  published: true,
  ...extra,
})

describe('isSameEvent', () => {
  it('matches the polio NEOC case headlines (1290/1292/1298)', () => {
    const polio = [
      'Karachi Polio Case Is First in Nearly Two Years; Tally Hits 7',
      'Pakistan Confirms Seventh Polio Case of the Year in Karachi East',
      'Vaccination urgency grows as Karachi East logs first polio case',
    ]
    expect(isSameEvent(polio[0]!, polio[1]!)).toBe(true)
    expect(isSameEvent(polio[1]!, polio[2]!)).toBe(true)
    expect(isSameEvent(polio[0]!, polio[2]!)).toBe(true)
  })

  it('matches the Punjab smart-glasses ban (1293/1309)', () => {
    expect(
      isSameEvent(
        'Punjab Hidden Camera Ban Covers Smart Glasses, Pens, Watches',
        'Punjab Bans Smart Glasses, Hidden-Camera Devices Over Privacy',
      ),
    ).toBe(true)
  })

  it('matches the Saudi pact and Naqvi US-Iran pairs', () => {
    expect(
      isSameEvent('Munir, Saudi envoy Albugamy review Makkah defence pact progress', 'Pakistan Saudi defence pact progress: Munir meets new envoy'),
    ).toBe(true)
    expect(
      isSameEvent("Naqvi says Pakistan 'never gave up' on US-Iran mediation", 'Naqvi says Pakistan made every effort to bring US, Iran to talks'),
    ).toBe(true)
  })

  it('strips a trailing outlet name from a source headline', () => {
    expect(isSameEvent('Punjab bans smart glasses and hidden cameras - Dawn', 'Punjab Bans Smart Glasses, Hidden-Camera Devices Over Privacy')).toBe(true)
  })

  it('keeps different stories apart', () => {
    expect(isSameEvent('Karachi Polio Case Is First in Nearly Two Years; Tally Hits 7', 'Karachi heatwave: schools shut as mercury hits 44')).toBe(false)
    expect(isSameEvent('Punjab Bans Smart Glasses, Hidden-Camera Devices Over Privacy', 'Punjab approves new wheat support price for 2027 crop')).toBe(false)
    expect(isSameEvent('SBP keeps policy rate at 11 percent', 'SBP cuts policy rate by 100bps')).toBe(false)
    expect(isSameEvent('Pakistan beat Australia in first ODI', 'Pakistan name squad for Australia series')).toBe(false)
  })
})

describe('reopen versus close and rolling clusters (ZAV-211)', () => {
  it('does not treat a reopening as the same event as the closing', () => {
    expect(isSameEvent('Pakistan closes Gabd border crossing with Iran, trade halted', 'Pakistan reopens Gabd border crossing with Iran, trade resumes')).toBe(false)
    expect(isSameEvent('Pakistan reopens Gabd border crossing with Iran', 'Gabd border crossing with Iran reopened - Dawn')).toBe(true)
  })

  it('one stray post in a 114-title cluster does not tie it to an older article', () => {
    const lpg = art('1410', 'LPG price hike: Rates Hit Record Rs600 per Kg Amid Shortage', '2026-10-22T10:00:00Z')
    const titles = ['Pakistan Closes Trade at Rimdan-Gabd Border Crossing with Iran - WANA News Agency']
    for (let i = 0; i < 100; i++) titles.push(`Gabd border reopening update number ${i} from Iran trade desk`)
    titles.push('LPG price hit record Rs600 per kg amid shortage')
    expect(findSameStory(titles, [lpg], NOW).kind).toBe('none')
  })

  it('a headline match still counts on its own', () => {
    const lpg = art('1410', 'LPG price hike: Rates Hit Record Rs600 per Kg Amid Shortage', '2026-10-22T10:00:00Z')
    const titles = ['LPG price hit record Rs600 per kg amid shortage', ...Array.from({ length: 50 }, (_, i) => `Unrelated post ${i} about cricket`)]
    expect(findSameStory(titles, [lpg], NOW).kind).toBe('update')
  })
})

describe('findSameStory', () => {
  const polio1290 = art('1290', 'Karachi Polio Case Is First in Nearly Two Years; Tally Hits 7', '2026-10-19T16:23:41Z')

  it('routes a new polio cluster to an update of the earlier live article', () => {
    const v = findSameStory(['Vaccination urgency grows as Karachi East logs first polio case'], [polio1290], NOW)
    expect(v).toEqual({ kind: 'update', article: polio1290 })
  })

  it('prefers the live article published first', () => {
    const later = art('1298', 'Vaccination urgency grows as Karachi East logs first polio case', '2026-10-19T18:11:19Z')
    const v = findSameStory(['Pakistan Confirms Seventh Polio Case of the Year in Karachi East'], [later, polio1290], NOW)
    expect(v.kind === 'update' && v.article.id).toBe('1290')
  })

  it('skips instead of updating twice inside 2h', () => {
    const updated = { ...polio1290, lastUpdateAt: '2026-10-19T22:00:00Z' }
    const v = findSameStory(['Pakistan Confirms Seventh Polio Case of the Year in Karachi East'], [updated], NOW)
    expect(v.kind).toBe('skip')
    const later = { ...polio1290, lastUpdateAt: '2026-10-19T20:30:00Z' }
    expect(findSameStory(['Pakistan Confirms Seventh Polio Case of the Year in Karachi East'], [later], NOW).kind).toBe('update')
  })

  it('skips when the matching article is still an unpublished draft', () => {
    const draft = art('1309', 'Punjab Bans Smart Glasses, Hidden-Camera Devices Over Privacy', '2026-10-19T20:57:53Z', { published: false })
    const v = findSameStory(['Punjab Hidden Camera Ban Covers Smart Glasses, Pens, Watches'], [draft], NOW)
    expect(v.kind).toBe('skip')
  })

  it('ignores articles older than 48h and unrelated ones', () => {
    const old = art('1', 'Karachi Polio Case Is First in Nearly Two Years; Tally Hits 7', '2026-10-15T10:00:00Z')
    expect(findSameStory(['Pakistan Confirms Seventh Polio Case of the Year in Karachi East'], [old], NOW).kind).toBe('none')
    expect(findSameStory(['Rupee closes flat against dollar in interbank'], [polio1290], NOW).kind).toBe('none')
  })
})
