import { describe, expect, it, vi } from 'vitest'
import { refetchThinItems } from './write.js'

const long = 'Reporting sentence. '.repeat(30)
const item = (id: string, url: string) => ({ id, url, title: `Story ${id}` })

describe('refetchThinItems (ZAV-285)', () => {
  it('saves text fetched again for a thin item', async () => {
    const patchSourceItem = vi.fn()
    const saved = await refetchThinItems([item('1', 'https://www.dawn.com/news/1')], { patchSourceItem }, '9', { fetchText: async () => long, allowed: async () => true })
    expect(saved).toBe(true)
    expect(patchSourceItem).toHaveBeenCalledWith('1', { contentText: long })
  })
  it('skips robots-blocked, Google News, already-readable and too-short results', async () => {
    const patchSourceItem = vi.fn()
    const fetchText = vi.fn().mockResolvedValue('short')
    const items = [
      item('1', 'https://news.google.com/rss/articles/x'),
      { ...item('2', 'https://a.example/2'), contentText: long },
      item('3', 'https://blocked.example/3'),
      item('4', 'https://b.example/4'),
    ]
    const saved = await refetchThinItems(items, { patchSourceItem }, '9', { fetchText, allowed: async (u) => !u.includes('blocked') })
    expect(saved).toBe(false)
    expect(fetchText).toHaveBeenCalledTimes(1)
    expect(patchSourceItem).not.toHaveBeenCalled()
  })
  it('survives a fetch error', async () => {
    const saved = await refetchThinItems([item('1', 'https://a.example/1')], { patchSourceItem: vi.fn() }, '9', { fetchText: async () => { throw new Error('boom') }, allowed: async () => true })
    expect(saved).toBe(false)
  })
})
