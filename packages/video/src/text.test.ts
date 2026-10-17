import { describe, expect, it } from 'vitest'
import { creditLine, findFigure, findHighlight, isSombre, shortenHeadline } from './text'

describe('shortenHeadline', () => {
  it('keeps short headlines', () => {
    expect(shortenHeadline('SBP holds rate at 11%')).toBe('SBP holds rate at 11%')
  })
  it('keeps a headline of exactly max length', () => {
    const t = 'a'.repeat(34) + ' ' + 'b'.repeat(35)
    expect(t.length).toBe(70)
    expect(shortenHeadline(t)).toBe(t)
  })
  it('cuts at the last colon boundary', () => {
    const t = 'Finance ministry confirms new tax slabs: salaried class to pay more from July, officials say'
    expect(shortenHeadline(t)).toBe('Finance ministry confirms new tax slabs')
  })
  it('cuts at an em dash', () => {
    const t = 'Pakistan beat South Africa by six wickets in Rawalpindi — series level at 1-1 with decider on Sunday'
    expect(shortenHeadline(t)).toBe('Pakistan beat South Africa by six wickets in Rawalpindi')
  })
  it('cuts at a comma', () => {
    const t = 'Government raises petrol price by Rs5 per litre, diesel unchanged for the next fortnight'
    expect(shortenHeadline(t)).toBe('Government raises petrol price by Rs5 per litre')
  })
  it('falls back to the last space', () => {
    const t = 'Heavy rain lashes Lahore and central Punjab flooding several low lying areas overnight today'
    const s = shortenHeadline(t)
    expect(s.length).toBeLessThanOrEqual(70)
    expect(t.startsWith(s)).toBe(true)
    expect(s.endsWith(' ')).toBe(false)
  })
  it('never ends on a stop word', () => {
    const t = 'Prime Minister announces a relief package for the flood victims of Sindh and the'
    const s = shortenHeadline(t, 64)
    expect(s.split(' ').pop()).not.toMatch(/^(a|an|the|of|to|in|on|for|and|as|at|by|with|from)$/i)
  })
  it('strips a dangling stop word after a boundary cut', () => {
    const t = 'Pakistan and the International Monetary Fund reach staff level agreement on the, with more to come soon'
    const s = shortenHeadline(t, 72)
    expect(s.toLowerCase().endsWith(' the')).toBe(false)
  })
  it('never adds an ellipsis or trailing punctuation', () => {
    const s = shortenHeadline('Stocks surge past 120,000 points as investors cheer the IMF review outcome, rupee firm.', 60)
    expect(s).not.toMatch(/[.,;:…-]$/)
    expect(s).not.toContain('...')
  })
  it('handles a single very long word', () => {
    expect(shortenHeadline('x'.repeat(100)).length).toBe(70)
  })
})

describe('findFigure', () => {
  it('prefers money over percent', () => {
    expect(findFigure('Auto financing in Pakistan climbs 33.61% YoY to Rs407bn')?.value).toBe('Rs407bn')
  })
  it('finds Rs with commas and a label from the following words', () => {
    const f = findFigure('Gold hits Rs 432,151 per tola in local market today')
    expect(f?.value).toBe('Rs 432,151')
    expect(f?.label).toBe('PER TOLA IN LOCAL')
  })
  it('finds dollars', () => {
    expect(findFigure('IMF releases $1.2bn tranche for Pakistan')?.value).toBe('$1.2bn')
  })
  it('finds percent', () => {
    expect(findFigure('Inflation eases to 4.1% in September', 'Business')?.value).toBe('4.1%')
  })
  it('finds a number with a unit word', () => {
    expect(findFigure('Over 120 people rescued from Swat river', 'Pakistan')?.value).toBe('120 people')
  })
  it('falls back to the category label', () => {
    expect(findFigure('SBP cuts rate by 2%', 'Business')?.label).toBe('BUSINESS')
  })
  it('returns null without a token', () => {
    expect(findFigure('Cabinet approves new energy policy')).toBeNull()
    expect(findFigure('Top 5 reasons why')).toBeNull()
  })
})

describe('findHighlight', () => {
  it('uses the figure', () => {
    expect(findHighlight('Auto financing climbs to Rs407bn')).toBe('Rs407bn')
  })
  it('finds a proper noun not at position 0', () => {
    expect(findHighlight('Why the State Bank of Pakistan kept rates steady')).toBe('State Bank')
  })
  it('skips a proper noun at position 0', () => {
    expect(findHighlight('Prime Minister meets army chief in capital')).toBeUndefined()
  })
  it('picks the longest', () => {
    expect(findHighlight('Chief Justice meets Supreme Court Bar Association')).toBe('Supreme Court Bar Association')
  })
  it('returns undefined when nothing stands out', () => {
    expect(findHighlight('rain expected across the country')).toBeUndefined()
  })
})

describe('isSombre', () => {
  it('matches sombre words', () => {
    expect(isSombre('Five killed as flood waters hit Swat')).toBe(true)
    expect(isSombre('Blast in Quetta market')).toBe(true)
    expect(isSombre('Bus CRASH near Sukkur')).toBe(true)
  })
  it('does not match substrings or ordinary news', () => {
    expect(isSombre('Rupee gains against dollar')).toBe(false)
    expect(isSombre('Deathly quiet market')).toBe(false)
    expect(isSombre('Floodlights installed at stadium')).toBe(false)
  })
})

describe('creditLine', () => {
  it('uses up to two tier 1-2 sources, deduplicated', () => {
    expect(
      creditLine([
        { name: 'Dawn', tier: 2 },
        { name: 'dawn', tier: 1 },
        { name: 'Google News', tier: 2 },
        { name: 'Reuters', tier: 1 },
        { name: 'Geo', tier: 2 },
      ]),
    ).toBe('via Dawn · Reuters')
  })
  it('is empty without good sources', () => {
    expect(creditLine([{ name: 'Blog', tier: 3 }, { name: '', tier: 1 }])).toBe('')
  })
})

describe('clean cuts (no dangling words)', () => {
  it('keeps the head before a colon instead of cutting mid-sentence', async () => {
    const { shortenHeadline } = await import('./text')
    expect(shortenHeadline('Pakistan school collapse: relatives claim warnings were ignored by officials for months', 60)).toBe('Pakistan school collapse')
  })
  it('keeps a slightly long title whole unless strict', async () => {
    const { shortenHeadline } = await import('./text')
    const t = 'Fakhar Zaman sets sights on final 2027 World Cup glory with Pakistan'
    expect(shortenHeadline(t, 60)).toBe(t)
    expect(shortenHeadline(t, 60, true).length).toBeLessThanOrEqual(60)
  })
  it('cuts a standfirst at a sentence or clause end, or drops it', async () => {
    const { shortenDek } = await import('./text')
    expect(shortenDek('Tomatoes fell 23% in the week. Wheat flour, chicken and pulses became dearer while year-on-year inflation stayed high at 11.38% across the country', 140)).toBe('Tomatoes fell 23% in the week.')
    expect(shortenDek('a'.repeat(200), 140)).toBeNull()
  })
})
