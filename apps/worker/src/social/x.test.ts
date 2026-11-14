import { describe, expect, it, vi } from 'vitest'
import { postX } from './x.js'

describe('postX without API keys', () => {
  it('reports no-route (so the job is retried) when the Chrome extension is offline, and records nothing', async () => {
    const upsertSocialPost = vi.fn()
    const r = await postX(
      { articleId: '1', copy: { x: 'Hello' }, priority: 'normal', url: 'https://zaviya.pk/a' },
      { env: {} as never, payload: { upsertSocialPost } as never, bridge: { isConnected: () => false } as never },
    )
    expect(r).toBe('no-route')
    expect(upsertSocialPost).not.toHaveBeenCalled()
  })
  it('posts through the extension when it is online', async () => {
    const upsertSocialPost = vi.fn().mockResolvedValue(undefined)
    const r = await postX(
      { articleId: '1', copy: { x: 'Hello' }, priority: 'normal', url: 'https://zaviya.pk/a' },
      { env: {} as never, payload: { upsertSocialPost } as never, bridge: { isConnected: () => true, send: vi.fn().mockResolvedValue({ externalId: '9' }) } as never },
    )
    expect(r).toBe('posted')
    expect(upsertSocialPost).toHaveBeenCalledWith(expect.objectContaining({ status: 'posted', externalId: '9' }))
  })
})
