import { describe, expect, it } from 'vitest'
import { chooseTemplate, escapeHtml, headlineSize, markHighlight, postCardHtml } from './post-card.js'

describe('post card', () => {
  it('picks breaking, then figure, then bilingual', () => {
    expect(chooseTemplate({ breaking: true, figure: { value: '5%', label: 'x' } })).toBe('ticker')
    expect(chooseTemplate({ figure: { value: 'Rs5.40', label: 'cheaper' } })).toBe('figure')
    expect(chooseTemplate({})).toBe('bilingual')
  })

  it('uses the one new look for number and breaking stories too', () => {
    const fig = postCardHtml({ title: 'IESCO sale: 10 bidders prequalified', category: 'business', photo: null, figure: { value: '10', label: 'bidders' } })
    expect(fig).not.toContain('NUMBERS')
    expect(fig).toContain('class="hl"')
    const brk = postCardHtml({ title: 'Blast in Quetta', category: 'pakistan', photo: null, breaking: true })
    expect(brk).toContain('BREAKING')
    expect(brk).not.toContain('ZAVIYA / ')
  })

  it('highlights the first match and escapes everything', () => {
    expect(markHighlight('Widen the tax net', 'TAX NET')).toBe('Widen the <span class="hl">tax net</span>')
    expect(markHighlight('A <b> & co', 'nothing')).toBe('A &lt;b&gt; &amp; co')
    expect(escapeHtml(`"'`)).toBe('&quot;&#39;')
  })

  it('steps the headline down as it gets longer', () => {
    expect(headlineSize('x'.repeat(40), 'bilingual')).toBeGreaterThan(headlineSize('x'.repeat(100), 'bilingual'))
  })

  it('puts both headlines on the card and never raw html from the writer', () => {
    const html = postCardHtml({ title: 'Petrol <cut>', category: 'business', photo: null, headlineUr: 'پیٹرول سستا' })
    expect(html).toContain('Petrol &lt;cut&gt;')
    expect(html).toContain('پیٹرول سستا')
  })
})

describe('image routing', async () => {
  const { deferImage, geminiAccounts } = await import('./media.js')

  it('tries Waleed\'s account first, then the next one', () => {
    expect(geminiAccounts('waleedchaudry595@gmail.com, 4')).toEqual(['waleedchaudry595@gmail.com', '4'])
    expect(geminiAccounts(undefined)).toEqual([undefined])
  })

  it('makes the image only after the editor approves, except breaking news and live updates', () => {
    expect(deferImage({ gate: true, priority: 'normal' })).toBe(true)
    expect(deferImage({ gate: true, priority: 'normal', articleId: '12' })).toBe(false)
    expect(deferImage({ gate: true, priority: 'breaking' })).toBe(false)
    expect(deferImage({ gate: true, priority: 'high', isUpdate: true })).toBe(false)
    expect(deferImage({ gate: false, priority: 'normal' })).toBe(false)
  })
})
