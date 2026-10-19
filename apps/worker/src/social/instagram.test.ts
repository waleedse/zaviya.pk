import { describe, expect, it } from 'vitest'
import { hasPublishingRoom } from './instagram.js'

describe('hasPublishingRoom', () => {
  it('uses the quota_total Instagram returns (100), not 50', () => {
    expect(hasPublishingRoom({ data: [{ quota_usage: 51, config: { quota_total: 100 } }] })).toBe(true)
    expect(hasPublishingRoom({ data: [{ quota_usage: 100, config: { quota_total: 100 } }] })).toBe(false)
  })
  it('falls back to 100 when config is missing', () => {
    expect(hasPublishingRoom({ data: [{ quota_usage: 51 }] })).toBe(true)
    expect(hasPublishingRoom({ data: [{ quota_usage: 100 }] })).toBe(false)
  })
  it('allows posting when the response is empty', () => {
    expect(hasPublishingRoom({})).toBe(true)
  })
})

import { afterEach, vi } from 'vitest'
import { findPublishedMedia, graphErrorText, postInstagram } from './instagram.js'
import type { WorkerEnv } from '../config.js'
import type { PayloadClient } from '../payload-client.js'

describe('graphErrorText', () => {
  it('prefers the user message and adds the code', () => {
    expect(graphErrorText({ error: { message: 'x', error_user_msg: 'Restricted', code: 25 } }, 400)).toBe('Restricted (code 25)')
    expect(graphErrorText({ error: { message: 'Media ID is not available', code: 9007 } }, 400)).toBe('Media ID is not available (code 9007)')
    expect(graphErrorText({}, 500)).toBe('HTTP 500')
  })
})

describe('findPublishedMedia', () => {
  const now = Date.parse('2026-10-17T21:40:30Z')
  it('matches the same caption published after we started, with Instagram +0000 timestamps', () => {
    const media = [
      { id: '1', caption: 'old', timestamp: '2026-10-17T21:00:00+0000' },
      { id: '2', caption: 'hello\n', timestamp: '2026-10-17T21:40:26+0000' },
    ]
    expect(findPublishedMedia(media, 'hello', now)?.id).toBe('2')
  })
  it('ignores an identical caption from long before', () => {
    expect(findPublishedMedia([{ id: '3', caption: 'hello', timestamp: '2026-10-16T10:00:00+0000' }], 'hello', now)).toBeUndefined()
  })
})

describe('postInstagram', () => {
  afterEach(() => vi.unstubAllGlobals())
  const env = { IG_USER_ID: 'ig1', META_PAGE_TOKEN: 'tok' } as unknown as WorkerEnv
  const input = { articleId: 'a1', copy: { instagram: 'hello' }, mediaUrls: ['https://zaviya.pk/api/media/file/x-post.png', 'https://zaviya.pk/api/media/file/x-card.png'] }
  const json = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body })

  function run(publish: unknown, publishOk: boolean, listed: unknown[]) {
    const upsert = vi.fn().mockResolvedValue({ id: '1', created: true })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('content_publishing_limit')) return json({ data: [{ quota_usage: 1 }] })
        if (url.includes('/media_publish')) return json(publish, publishOk, publishOk ? 200 : 400)
        if (url.includes('fields=id,caption,timestamp')) return json({ data: listed })
        if (url.includes('status_code')) return json({ status_code: 'FINISHED' })
        return json({ id: 'container1' })
      }),
    )
    return postInstagram(input, { env, payload: { upsertSocialPost: upsert } as unknown as PayloadClient, sleep: async () => {} }).then(() => upsert)
  }

  it('marks posted with the media id on a normal publish and records one card (not a carousel)', async () => {
    const upsert = await run({ id: 'm1' }, true, [])
    expect(upsert.mock.calls[0]![0]).toMatchObject({ status: 'posted', externalId: 'm1', format: 'card' })
  })

  it('finds the live post when media_publish answers with an error and marks it posted', async () => {
    const withLinkCaption = 'hello'
    const upsert = await run({ error: { message: 'Media ID is not available', code: 9007 } }, false, [
      { id: 'live1', caption: withLinkCaption, timestamp: new Date().toISOString().replace('Z', '+0000') },
    ])
    expect(upsert.mock.calls[0]![0]).toMatchObject({ status: 'posted', externalId: 'live1' })
  })

  it('stores Meta\'s error text when media_publish failed and nothing is live', async () => {
    const upsert = await run({ error: { message: 'Media ID is not available', code: 9007 } }, false, [])
    expect(upsert.mock.calls[0]![0]).toMatchObject({ status: 'failed', error: 'IG publish failed: Media ID is not available (code 9007)' })
  })
})
