import { afterEach, describe, expect, it, vi } from 'vitest'
import { postFacebook, postFirstComment } from './facebook.js'
import type { WorkerEnv } from '../config.js'
import type { PayloadClient } from '../payload-client.js'

const json = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body })

describe('postFirstComment', () => {
  it('posts the link, retrying until it works', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(json({ error: { message: 'busy', code: 2 } }, false, 500)).mockResolvedValueOnce(json({ id: 'c1' }))
    expect(await postFirstComment('p1', 'https://zaviya.pk/a/b', 'tok', { fetchFn: fetchFn as unknown as typeof fetch, waitMs: [0, 0, 0] })).toBeUndefined()
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(fetchFn.mock.calls[0]![0]).toContain('/p1/comments')
  })
  it('returns the reason after three failures', async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({ error: { message: 'no permission', code: 200 } }, false, 403))
    expect(await postFirstComment('p1', 'u', 't', { fetchFn: fetchFn as unknown as typeof fetch, waitMs: [0, 0, 0] })).toBe('no permission (code 200)')
    expect(fetchFn).toHaveBeenCalledTimes(3)
  })
})

describe('postFacebook with the link in the first comment', () => {
  afterEach(() => vi.unstubAllGlobals())
  const media = ['https://zaviya.pk/api/media/file/x-post.png']
  const input = { articleId: 'a1', copy: { facebook: 'Petrol cut. Will it last? #a #b #c' }, mediaUrls: media, url: 'https://zaviya.pk/business/petrol' }
  function run(flag: boolean) {
    const calls: { url: string; body: string }[] = []
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push({ url, body: String(init?.body) })
      return url.endsWith('/photos') ? json({ id: 'photo1', post_id: 'page_post1' }) : json({ id: 'comment1' })
    })
    const saved: Record<string, unknown>[] = []
    const payload = { upsertSocialPost: async (b: Record<string, unknown>) => void saved.push(b) } as unknown as PayloadClient
    const env = { META_PAGE_ID: 'page', META_PAGE_TOKEN: 'tok', FB_LINK_IN_COMMENT: flag } as unknown as WorkerEnv
    return postFacebook(input, { env, payload }).then(() => ({ calls, saved }))
  }
  it('keeps the link out of the caption and comments it on the post', async () => {
    const { calls, saved } = await run(true)
    const photo = new URLSearchParams(calls[0]!.body)
    expect(photo.get('caption')).toBe('Petrol cut. Will it last? #a #b')
    expect(calls[1]!.url).toContain('/page_post1/comments')
    expect(new URLSearchParams(calls[1]!.body).get('message')).toBe(input.url)
    expect(saved[0]).toMatchObject({ status: 'posted', externalId: 'page_post1' })
    expect(saved[0]!.error).toBeUndefined()
  })
  it('switches back to the link in the caption', async () => {
    const { calls } = await run(false)
    expect(calls).toHaveLength(1)
    expect(new URLSearchParams(calls[0]!.body).get('caption')).toContain(`Read the full story: ${input.url}`)
  })
})
