import { describe, expect, it } from 'vitest'
import { quoteCardHtml, quoteSize } from './quote-card.js'

const base = { quote: 'AI will change every business.', speaker: 'Sam Altman', role: 'CEO of OpenAI', sourceLabel: '@sama on X', lang: 'en' as const, photo: 'data:image/jpeg;base64,AAAA', photoCredit: 'Photo: A / CC BY 2.0 / Wikimedia Commons' }

describe('quote card', () => {
  it('puts the photo behind, the quote, the name and role, the source and the brand on the card', () => {
    const html = quoteCardHtml(base)
    expect(html).toContain('data:image/jpeg;base64,AAAA')
    expect(html).toContain('AI will change every business.')
    expect(html).toContain('Sam Altman')
    expect(html).toContain('CEO of OpenAI')
    expect(html).toContain('SOURCE: @SAMA ON X')
    expect(html).toContain('zaviya')
    expect(html).toContain('Photo: A / CC BY 2.0 / Wikimedia Commons')
  })
  it('escapes the quote and sets Urdu right to left', () => {
    expect(quoteCardHtml({ ...base, quote: 'He said <b>no</b> & left' })).toContain('He said &lt;b&gt;no&lt;/b&gt; &amp; left')
    expect(quoteCardHtml({ ...base, lang: 'ur', quote: 'یہ ایک اردو بیان ہے' })).toContain('class="ur"')
  })
  it('steps the type down for long quotes', () => {
    expect(quoteSize('x'.repeat(60), 'en')).toBeGreaterThan(quoteSize('x'.repeat(220), 'en'))
  })
})
