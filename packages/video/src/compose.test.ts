import { describe, expect, it } from 'vitest'
import { compose, NotEnoughStories, rateTiles } from './compose'
import { TOTAL_FRAMES } from './constants'
import type { EditionInput, RateInput, StoryInput, TrackInfo } from './types'

const TRACKS: TrackInfo[] = [
  { id: 'b1', file: 'audio/b1.wav', bpm: 120, firstBeatMs: 0, mood: 'bright' },
  { id: 'b2', file: 'audio/b2.wav', bpm: 120, firstBeatMs: 0, mood: 'bright' },
  { id: 'n1', file: 'audio/n1.wav', bpm: 110, firstBeatMs: 0, mood: 'night' },
  { id: 'c1', file: 'audio/c1.wav', bpm: 80, firstBeatMs: 0, mood: 'calm' },
]
const DATE = '2026-10-17T03:00:00Z'

const titles = [
  'State Bank holds policy rate at 11% as inflation eases',
  'Pakistan beat South Africa by six wickets in Rawalpindi Test',
  'Government raises petrol price by Rs5 per litre from midnight',
  'Apple unveils new chip for the next generation of laptops this week',
  'Lahore smog worsens as air quality index crosses 400',
]
function story(i: number, over: Partial<StoryInput> = {}): StoryInput {
  return {
    id: i,
    slug: `s${i}`,
    title: titles[i % titles.length]!,
    category: ['pakistan', 'cricket', 'business', 'tech-telecom', 'world'][i % 5]!,
    image: `${i}.jpg`,
    sources: [{ name: 'Dawn', tier: 2 }],
    isBreaking: false,
    priority: 'normal',
    publishedAt: DATE,
    ...over,
  }
}
const rate = (series: RateInput['series'], value: number, previous: number | null, observedAt = '2026-10-16T20:00:00Z'): RateInput => ({
  series,
  value,
  previous,
  unit: 'PKR',
  source: 'SBP',
  observedAt,
})
const RATES = [rate('usd_interbank', 276.98, 277.2), rate('gold_24k_tola', 432151, 430000), rate('petrol_super', 386.3, 386.3)]
const input = (n: number, rates = RATES, over: Partial<EditionInput> = {}): EditionInput => ({
  edition: 'morning',
  date: DATE,
  stories: Array.from({ length: n }, (_, i) => story(i)),
  rates,
  ...over,
})

describe('compose totals', () => {
  for (const n of [3, 4, 5]) {
    for (const withNumbers of [true, false]) {
      it(`${n} stories ${withNumbers ? 'with' : 'without'} numbers = 900 frames`, () => {
        const t = compose(input(n, withNumbers ? RATES : []), 'headlines30', TRACKS)
        const sum = t.scenes.reduce((a, s) => a + s.durationInFrames, 0)
        expect(sum - t.transitionFrames * (t.scenes.length - 1)).toBe(TOTAL_FRAMES)
        expect(t.totalFrames).toBe(TOTAL_FRAMES)
        expect(t.scenes.some((s) => s.kind === 'numbers')).toBe(withNumbers)
        expect(t.scenes.filter((s) => s.kind === 'story')).toHaveLength(n)
      })
    }
  }
  it('is exactly 900 on every track bpm', () => {
    for (const id of ['b1', 'n1', 'c1']) {
      expect(compose(input(5, RATES, { trackId: id }), 'headlines30', TRACKS).totalFrames).toBe(900)
      expect(compose(input(3, [], { trackId: id }), 'headlines30', TRACKS).totalFrames).toBe(900)
    }
  })
  it('keeps every scene long enough to read', () => {
    for (const s of compose(input(5), 'headlines30', TRACKS).scenes) expect(s.durationInFrames).toBeGreaterThanOrEqual(45)
  })
  it('is deterministic', () => {
    expect(compose(input(5), 'headlines30', TRACKS)).toEqual(compose(input(5), 'headlines30', TRACKS))
  })
})

describe('scene order', () => {
  it('hook, S1..S4, numbers, S5, outro', () => {
    const t = compose(input(5), 'headlines30', TRACKS)
    expect(t.scenes.map((s) => (s.kind === 'story' ? `S${s.index}` : s.kind))).toEqual([
      'hook', 'S1', 'S2', 'S3', 'S4', 'numbers', 'S5', 'outro',
    ])
  })
  it('numbers goes before the last story when there are fewer', () => {
    const t = compose(input(3), 'headlines30', TRACKS)
    expect(t.scenes.map((s) => (s.kind === 'story' ? `S${s.index}` : s.kind))).toEqual(['hook', 'S1', 'S2', 'numbers', 'S3', 'outro'])
  })
  it('takes at most six stories', () => {
    expect(compose(input(8), 'headlines30', TRACKS).scenes.filter((s) => s.kind === 'story')).toHaveLength(6)
  })
  it('lead story is the longest', () => {
    const t = compose(input(5), 'headlines30', TRACKS)
    const d = t.scenes.filter((s) => s.kind === 'story').map((s) => s.durationInFrames)
    expect(d[0]).toBe(Math.max(...d))
  })
})

describe('errors and modes', () => {
  it('throws NotEnoughStories under 3', () => {
    expect(() => compose(input(2), 'headlines30', TRACKS)).toThrow(NotEnoughStories)
    expect(() => compose(input(0), 'headlines30', TRACKS)).toThrow(NotEnoughStories)
  })
  it('breaking story moves to position 1 and sets mode, theme and hook', () => {
    const inp = input(5)
    inp.stories[2] = { ...inp.stories[2]!, isBreaking: true, priority: 'breaking' }
    const t = compose(inp, 'headlines30', TRACKS)
    const first = t.scenes.find((s) => s.kind === 'story')
    expect(first?.kind === 'story' && first.headline).toBe('Government raises petrol price by Rs5 per litre from midnight')
    expect(t.mode).toBe('breaking')
    expect(t.theme).toBe('breaking')
    const hook = t.scenes[0]
    expect(hook?.kind === 'hook' && hook.title).toEqual(['BREAKING', 'AND 4 MORE'])
    expect(t.totalFrames).toBe(900)
  })
  it('a breaking story outside the first five is still pulled in', () => {
    const inp = input(7)
    inp.stories[6] = { ...inp.stories[6]!, isBreaking: true }
    const t = compose(inp, 'headlines30', TRACKS)
    expect(t.mode).toBe('breaking')
    const first = t.scenes.find((s) => s.kind === 'story')
    expect(first?.kind === 'story' && first.index).toBe(1)
    expect(first?.kind === 'story' && first.image).toBe('6.jpg')
  })
  it('sombre when the lead is sombre, with the calm track', () => {
    const inp = input(5)
    inp.stories[0] = { ...inp.stories[0]!, title: 'Five killed as flood waters hit Swat valley villages' }
    const t = compose(inp, 'headlines30', TRACKS)
    expect(t.mode).toBe('sombre')
    expect(t.theme).toBe('sombre')
    expect(t.track.file).toBe('audio/c1.wav')
  })
  it('a sombre story that is not the lead keeps normal mode', () => {
    const inp = input(5)
    inp.stories[3] = { ...inp.stories[3]!, title: 'Blast in Quetta market' }
    expect(compose(inp, 'headlines30', TRACKS).mode).toBe('normal')
  })
  it('themes follow the edition', () => {
    expect(compose(input(5), 'headlines30', TRACKS).theme).toBe('sunrise')
    expect(compose(input(5, RATES, { edition: 'evening' }), 'headlines30', TRACKS).theme).toBe('night')
  })
})

describe('tracks', () => {
  it('uses trackId when given', () => {
    expect(compose(input(5, RATES, { trackId: 'n1' }), 'headlines30', TRACKS).track).toEqual({ file: 'audio/n1.wav', bpm: 110, firstBeatMs: 0 })
  })
  it('rotates by day of year within the mood', () => {
    const a = compose(input(5, RATES, { date: '2026-10-17T03:00:00Z' }), 'headlines30', TRACKS).track.file
    const b = compose(input(5, RATES, { date: '2026-10-18T03:00:00Z' }), 'headlines30', TRACKS).track.file
    expect(a).not.toBe(b)
    expect(['audio/b1.wav', 'audio/b2.wav']).toContain(a)
  })
  it('evening uses night mood', () => {
    expect(compose(input(5, RATES, { edition: 'evening' }), 'headlines30', TRACKS).track.file).toBe('audio/n1.wav')
  })
})

describe('hook, outro, headlines', () => {
  it('morning and evening hook titles use the real count', () => {
    const m = compose(input(4), 'headlines30', TRACKS).scenes[0]
    expect(m?.kind === 'hook' && m.title).toEqual(['4 STORIES', 'TO KNOW TODAY'])
    expect(m?.kind === 'hook' && m.dateLine).toBe('SAT 17 OCT · 6 JUMADA I')
    const e = compose(input(5, RATES, { edition: 'evening' }), 'headlines30', TRACKS).scenes[0]
    expect(e?.kind === 'hook' && e.title).toEqual(['TODAY IN', '30 SECONDS'])
  })
  it('outro asks to comment 1-n', () => {
    const o = compose(input(4), 'headlines30', TRACKS).scenes.at(-1)
    expect(o?.kind === 'outro' && o.cta).toBe('Which story matters most? Comment 1–4')
    expect(o?.kind === 'outro' && o.handles).toEqual(['@zaviya.pk'])
    expect(o?.kind === 'outro' && o.site).toBe('zaviya.pk')
  })
  it('derives figure, highlight, credit and category', () => {
    const t = compose(input(5), 'headlines30', TRACKS)
    const s1 = t.scenes.find((s) => s.kind === 'story')
    expect(s1?.kind === 'story' && s1.figure?.value).toBe('11%')
    expect(s1?.kind === 'story' && s1.highlight).toBe('11%')
    expect(s1?.kind === 'story' && s1.credit).toBe('via Dawn')
    expect(s1?.kind === 'story' && s1.category).toEqual({ slug: 'pakistan', label: 'Pakistan', color: '#0E7C5A' })
  })
  it('passes Urdu through when present', () => {
    const inp = input(3)
    inp.stories[0] = { ...inp.stories[0]!, titleUr: 'اسٹیٹ بینک نے شرح سود برقرار رکھی' }
    const s = compose(inp, 'headlines30', TRACKS).scenes.find((x) => x.kind === 'story')
    expect(s?.kind === 'story' && s.headlineUr).toBe('اسٹیٹ بینک نے شرح سود برقرار رکھی')
  })
})

describe('rateTiles', () => {
  it('formats tiles', () => {
    const t = rateTiles(RATES, DATE)
    expect(t[0]).toEqual({ label: 'USD/PKR', value: '276.98', delta: 'down', source: 'SBP' })
    expect(t[1]).toEqual({ label: 'GOLD 24K /TOLA', value: 'Rs 432,151', delta: 'up', source: 'SBP' })
    expect(t[2]).toEqual({ label: 'PETROL /LITRE', value: 'Rs 386.30', delta: 'flat', source: 'SBP' })
  })
  it('flat when no previous or change under 0.05%', () => {
    expect(rateTiles([rate('usd_interbank', 277, null)], DATE)[0]?.delta).toBe('flat')
    expect(rateTiles([rate('usd_interbank', 277.1, 277)], DATE)[0]?.delta).toBe('flat')
  })
  it('drops stale rates, and numbers needs two fresh tiles', () => {
    const stale = '2026-10-10T00:00:00Z'
    expect(rateTiles([rate('usd_interbank', 277, 276, stale)], DATE)).toHaveLength(0)
    const one = [rate('usd_interbank', 277, 276), rate('gold_24k_tola', 1, 1, stale), rate('petrol_super', 1, 1, stale)]
    expect(compose(input(5, one), 'headlines30', TRACKS).scenes.some((s) => s.kind === 'numbers')).toBe(false)
    expect(compose(input(5, one), 'headlines30', TRACKS).totalFrames).toBe(900)
  })
})
