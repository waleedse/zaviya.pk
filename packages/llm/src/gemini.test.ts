import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GeminiProvider } from './gemini.js'

describe('GeminiProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns false health without api key', async () => {
    const p = new GeminiProvider('')
    await expect(p.health()).resolves.toBe(false)
  })

  it('chat parses JSON content', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
        }),
        { status: 200 },
      ),
    )
    const p = new GeminiProvider('key')
    const res = await p.chat({
      model: 'gemini-2.5-flash',
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(res.content).toBe('{"ok":true}')
    expect(res.provider).toBe('gemini')
  })
})
