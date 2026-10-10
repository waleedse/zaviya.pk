import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OllamaProvider } from './ollama.js'

describe('OllamaProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('health checks /api/tags', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 200 }))
    const p = new OllamaProvider('http://ollama.test')
    await expect(p.health()).resolves.toBe(true)
    expect(fetch).toHaveBeenCalledWith('http://ollama.test/api/tags', expect.any(Object))
  })

  it('chat parses tool calls', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: {
            content: '',
            tool_calls: [{ function: { name: 'web_search', arguments: '{"q":"test"}' } }],
          },
        }),
        { status: 200 },
      ),
    )
    const p = new OllamaProvider('http://ollama.test')
    const res = await p.chat({
      model: 'qwen3:4b',
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(res.toolCalls[0]?.name).toBe('web_search')
    expect(res.toolCalls[0]?.arguments).toEqual({ q: 'test' })
  })
})
