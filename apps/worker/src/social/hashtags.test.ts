import { afterEach, describe, expect, it } from 'vitest'
import { currentTrends, finalizeCopy, hydrateTrends, isPartyTag, pickHashtags, rememberTrends, stripHashtags, toHashtag, trendHashtag } from './hashtags.js'

describe('hashtags', () => {
  it('camel-cases entities and drops generic or non-latin ones', () => {
    expect(toHashtag('State Bank of Pakistan')).toBe('#StateBankOfPakistan')
    expect(toHashtag('news')).toBeNull()
    expect(toHashtag('پیٹرول')).toBeNull()
  })

  it('never exceeds three, puts headline topics first and the brand last', () => {
    const tags = pickHashtags({ tags: ['IMF', 'Petrol', 'OGRA', 'Karachi'], category: 'business', title: 'Petrol price cut by Rs5 from Friday' })
    expect(tags.length).toBeLessThanOrEqual(3)
    expect(tags[0]).toBe('#Petrol')
    expect(tags.at(-1)).toBe('#Zaviya')
    expect(new Set(tags.map((t) => t.toLowerCase())).size).toBe(tags.length)
  })

  it('replaces the writer hashtags with the controlled set', () => {
    expect(stripHashtags('Big news #a #b\nmore')).toBe('Big news\nmore')
    const out = finalizeCopy({ facebook: 'f #x', instagram: 'i #1 #2 #3 #4 #5 #6 #7', x: 'x text #y' }, { tags: ['IMF'], category: 'business', title: 'IMF loan' })
    expect(out.instagram.match(/#\w+/g)!.length).toBeLessThanOrEqual(3)
    expect(out.instagram).not.toContain('#7')
    expect(out.x).toContain('#IMF')
  })
})

describe('trending hashtags', () => {
  afterEach(() => {
    rememberTrends('google', [])
    rememberTrends('x', [])
  })

  it('puts the trending topic first when the story matches a trend, three tags at most, brand last', () => {
    const tags = pickHashtags({
      tags: ['Binance', 'Crypto'],
      category: 'business',
      title: 'Binance hack: $6.3bn moved, what Pakistani users should check',
      trends: ['binance hack', 'psl draft'],
    })
    expect(tags).toEqual(['#BinanceHack', '#Binance', '#Zaviya'])
  })

  it('matches on words, not only the whole phrase, and ignores trends the story is not about', () => {
    expect(trendHashtag('us iran strikes', { title: 'Iran strike on a US base pushes oil above $100', tags: [] })).toBe('#IranStrikes')
    expect(trendHashtag('binance', { title: 'Binance pauses withdrawals', tags: [] })).toBe('#Binance')
    expect(trendHashtag('psl draft', { title: 'Petrol price cut from Friday', tags: [] })).toBeNull()
    expect(trendHashtag('iran news today', { title: 'Cricket: Pakistan beat Australia', tags: ['Cricket'] })).toBeNull()
    expect(trendHashtag('', { title: 'x', tags: [] })).toBeNull()
  })

  it('never uses a political-party, leader or army tag, from a trend or from the story tags', () => {
    expect(isPartyTag('#PTI')).toBe(true)
    expect(isPartyTag('#PMLN')).toBe(true)
    expect(isPartyTag('#ImranKhan')).toBe(true)
    expect(isPartyTag('#ISPR')).toBe(true)
    expect(isPartyTag('#Petrol')).toBe(false)
    expect(trendHashtag('pti', { title: 'PTI announces rally', tags: [] })).toBeNull()
    const tags = pickHashtags({ tags: ['PTI', 'Imran Khan', 'Lahore'], category: 'pakistan', title: 'PTI rally in Lahore draws crowd', trends: ['pti rally'] })
    expect(tags.some((t) => isPartyTag(t))).toBe(false)
    expect(tags).toContain('#Lahore')
    expect(tags.length).toBeLessThanOrEqual(3)
  })

  it('finalizeCopy reads the remembered trends, and old ones expire', () => {
    rememberTrends('google', ['binance hack'])
    const out = finalizeCopy({ facebook: 'f', instagram: 'i', x: 'x' }, { tags: ['Binance'], category: 'business', title: 'Binance hack explained' })
    expect(out.instagram).toContain('#BinanceHack')
    expect(out.facebook).toContain('#BinanceHack')
    expect(out.instagram.match(/#\w+/g)!.length).toBeLessThanOrEqual(3)
    expect(currentTrends(Date.now() + 7 * 3_600_000)).toEqual([])
    rememberTrends('google', [])
    expect(finalizeCopy({ facebook: 'f', instagram: 'i', x: 'x' }, { tags: ['Binance'], category: 'business', title: 'Binance hack explained' }).instagram).not.toContain('#BinanceHack')
  })

  it('reads the last snapshots back from redis after a restart', async () => {
    const data: Record<string, string> = {
      'zaviya:trends:pk': JSON.stringify({ at: new Date().toISOString(), trends: [{ query: 'binance hack' }] }),
      'zaviya:trends:x': JSON.stringify({ at: new Date().toISOString(), trends: [{ name: 'Hormuz' }] }),
    }
    await hydrateTrends({ get: async (k) => data[k] ?? null })
    expect(currentTrends()).toEqual(['binance hack', 'Hormuz'])
    await hydrateTrends({ get: async () => 'not json' })
  })
})


describe('trending keyword in the post text', () => {
  it('adds the matching trend as words as well as a hashtag, at most three hashtags', () => {
    const out = finalizeCopy(
      { facebook: 'Washington says more strikes are possible.', instagram: 'More strikes are possible.', x: 'More strikes are possible.' },
      { tags: ['Iran', 'Donald Trump'], category: 'world', title: 'Trump warns renewed Iran strike could be larger', trends: ['Iran strike'] },
    )
    expect(out.facebook).toContain('Trending: Iran strike')
    expect(out.instagram).toContain('Trending: Iran strike')
    expect(out.facebook).toContain('#IranStrike')
    expect(out.instagram.match(/#\w+/g)!.length).toBeLessThanOrEqual(3)
    expect(out.x).toContain('(Iran strike)')
  })
  it('does not repeat a trend the text already says, and never uses party or army terms', () => {
    const said = finalizeCopy({ facebook: 'Iran strike fears grow.', instagram: 'i', x: 'x' }, { tags: [], category: 'world', title: 'Iran strike fears', trends: ['Iran strike'] })
    expect(said.facebook).not.toContain('Trending:')
    const party = finalizeCopy({ facebook: 'f', instagram: 'i', x: 'x' }, { tags: ['PTI'], category: 'pakistan', title: 'PTI rally in Lahore', trends: ['PTI rally'] })
    expect(party.facebook).not.toContain('Trending:')
    expect(party.facebook).not.toMatch(/#PTI/i)
    const army = finalizeCopy({ facebook: 'f', instagram: 'i', x: 'x' }, { tags: [], category: 'pakistan', title: 'Pakistan army chief visits Quetta', trends: ['army chief visit'] })
    expect(army.facebook).not.toContain('Trending:')
  })
})
