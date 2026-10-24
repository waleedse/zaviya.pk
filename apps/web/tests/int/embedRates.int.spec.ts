import type { RateTick } from '@zaviya/shared'
import { describe, expect, it } from 'vitest'
import { embedSnippet, escapeHtml, parseEmbedParams, renderRatesEmbed, selectEmbedRates } from '../../src/lib/embed-rates'

const tick = (series: RateTick['series'], value: number, change = 100): RateTick => ({
  series,
  label: series === 'gold_24k_tola' ? 'Gold 24K / tola' : series === 'petrol_super' ? 'Petrol / litre' : 'Dollar (market)',
  value,
  unit: 'PKR',
  change,
  changePct: 0.1,
  observedAt: '2026-10-24T04:00:00.000Z',
  href: '/x',
  spark: [],
})
const ticks = [tick('gold_24k_tola', 412500), tick('usd_interbank', 281.5, -0.2), tick('usd_open_sell', 283), tick('petrol_super', 260.5, 0)]

describe('embed rates widget (ZAV-110)', () => {
  it('falls back to all/light for unknown params', () => {
    expect(parseEmbedParams(new URLSearchParams('type=<x>&theme=pink'))).toEqual({ type: 'all', theme: 'light' })
    expect(parseEmbedParams(new URLSearchParams('type=gold&theme=dark'))).toEqual({ type: 'gold', theme: 'dark' })
  })
  it('selects series by type', () => {
    expect(selectEmbedRates(ticks, 'gold').map((t) => t.series)).toEqual(['gold_24k_tola'])
    expect(selectEmbedRates(ticks, 'dollar')).toHaveLength(2)
    expect(selectEmbedRates(ticks, 'all')).toHaveLength(4)
  })
  it('renders a small noindex page with a followed Powered-by link and no scripts or cookies', () => {
    const html = renderRatesEmbed(ticks, { type: 'all', theme: 'light', origin: 'https://zaviya.pk' })
    expect(html).toContain('noindex')
    expect(html).toContain('Powered by Zaviya News')
    expect(html).toContain('href="https://zaviya.pk/gold-rate-today-pakistan?utm_source=embed')
    expect(html).not.toMatch(/<script|nofollow|set-cookie/i)
    expect(html).toContain('412,500')
    expect(Buffer.byteLength(html)).toBeLessThan(15 * 1024)
  })
  it('renders a placeholder without data and escapes html', () => {
    expect(renderRatesEmbed([], { type: 'gold', theme: 'dark', origin: 'https://zaviya.pk' })).toContain('being updated')
    expect(escapeHtml('<a href="x">&')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;')
  })
  it('snippet has the iframe and a plain link outside it', () => {
    const s = embedSnippet('gold', 'light', 'https://zaviya.pk')
    expect(s).toContain('<iframe src="https://zaviya.pk/embed/rates?type=gold&theme=light"')
    expect(s).toContain('</iframe>\n<p><a href="https://zaviya.pk/gold-rate-today-pakistan">Gold rate today by Zaviya News</a></p>')
  })
})
