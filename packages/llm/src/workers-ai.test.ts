import { describe, expect, it } from 'vitest'
import { LLMRouter } from './router.js'
import { WorkersAIProvider } from './workers-ai.js'

describe('Workers AI embeddings', () => {
  it('returns one 768-d vector per input and is used by the router for embeds', async () => {
    const fakeFetch = (async (_url: string, init?: RequestInit) => {
      const { text } = JSON.parse(String(init?.body)) as { text: string[] }
      return new Response(JSON.stringify({ success: true, result: { data: text.map(() => new Array(768).fill(0.1)) } }), { status: 200 })
    }) as typeof fetch
    const router = new LLMRouter({ localModel: 'off', embedder: { provider: new WorkersAIProvider('acc', 'tok', fakeFetch), model: '@cf/baai/bge-base-en-v1.5' } })
    const out = await router.embed('embed', ['a', 'b'])
    expect(out).toHaveLength(2)
    expect(out[0]).toHaveLength(768)
  })

  it('throws on an API error so the embed job is retried later', async () => {
    const failing = (async () => new Response(JSON.stringify({ success: false, errors: [{ message: 'quota' }] }), { status: 429 })) as typeof fetch
    await expect(new WorkersAIProvider('acc', 'tok', failing).embed('', ['a'])).rejects.toThrow(/429/)
  })
})
