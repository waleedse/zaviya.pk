import { describe, expect, it, vi } from 'vitest'
import { LLMRouter } from './router.js'
import { LOCAL_EMBED_MODEL, LocalEmbedProvider, type ExtractorLoader } from './local-embed.js'

const fakeLoader = (): { loader: ExtractorLoader; loads: () => number } => {
  let n = 0
  const loader: ExtractorLoader = async () => {
    n++
    return async (input) => ({ tolist: () => input.map(() => new Array(768).fill(0.05)) })
  }
  return { loader, loads: () => n }
}

describe('local embeddings', () => {
  it('returns one 768-d vector per input, loads the model once, and the router uses it for embeds', async () => {
    const { loader, loads } = fakeLoader()
    const router = new LLMRouter({ localModel: 'off', embedder: { provider: new LocalEmbedProvider(loader), model: LOCAL_EMBED_MODEL } })
    const a = await router.embed('embed', ['a', 'b'])
    const b = await router.embed('embed', ['c'])
    expect(a).toHaveLength(2)
    expect(a[0]).toHaveLength(768)
    expect(b).toHaveLength(1)
    expect(loads()).toBe(1)
    expect(router.embedModelId()).toBe(`local-embed:${LOCAL_EMBED_MODEL}`)
  })

  it('retries loading the model after a failed first load (e.g. download error)', async () => {
    const good = fakeLoader().loader
    const loader = vi.fn<ExtractorLoader>().mockRejectedValueOnce(new Error('offline')).mockImplementation(good)
    const p = new LocalEmbedProvider(loader)
    await expect(p.embed('', ['x'])).rejects.toThrow('offline')
    await expect(p.embed('', ['x'])).resolves.toHaveLength(1)
  })

  it('rejects a vector of the wrong size instead of storing it', async () => {
    const p = new LocalEmbedProvider(async () => async (input) => ({ tolist: () => input.map(() => [1, 2, 3]) }))
    await expect(p.embed('', ['x'])).rejects.toThrow(/unexpected shape/)
  })

  it('never calls the network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await new LocalEmbedProvider(fakeLoader().loader).embed('', ['x'])
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})
