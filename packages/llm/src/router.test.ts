import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LLMRouter } from './router.js'

describe('LLMRouter', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('falls back to gemini when ollama unhealthy', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: '{"decision":"reject"}' }] } }],
          }),
          { status: 200 },
        ),
      )

    const router = new LLMRouter({ geminiApiKey: 'test-key', ollamaUrl: 'http://127.0.0.1:11434' })
    const res = await router.chat('triage', {
      messages: [{ role: 'user', content: 'score' }],
      timeoutMs: 5000,
    })
    expect(res.provider).toBe('gemini')
  })
})
