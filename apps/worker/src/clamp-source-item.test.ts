import { describe, expect, it } from 'vitest'
import { clampSourceItem, SOURCE_TEXT_MAX } from './payload-client.js'

describe('clampSourceItem', () => {
  it('cuts text past the 40k field limit so the batch is not refused', () => {
    const it0 = { title: 'x'.repeat(2000), summary: 's'.repeat(50_000), contentText: null, url: 'u' }
    const out = clampSourceItem(it0)
    expect(out.summary!.length).toBe(SOURCE_TEXT_MAX)
    expect(out.title.length).toBe(1000)
    expect(out.contentText).toBeNull()
    expect(out.url).toBe('u')
  })
  it('leaves normal items alone', () => {
    const it0 = { title: 't', summary: 'short' }
    expect(clampSourceItem(it0)).toEqual(it0)
  })
})
