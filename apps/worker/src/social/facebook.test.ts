import { afterEach, describe, expect, it, vi } from 'vitest'
import { commentsBlocked, postFacebook, postFirstComment, resetCommentBlock } from './facebook.js'
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
  afterEach(() => {
    vi.unstubAllGlobals()
    resetCommentBlock()
  })
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

describe('ZAV-138 caption fallback when the comment is refused (#200)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    resetCommentBlock()
  })
  const input = { articleId: 'a1', copy: { facebook: 'Petrol cut. #a' }, mediaUrls: ['https://zaviya.pk/api/media/file/x-post.png'], url: 'https://zaviya.pk/business/petrol' }
  function setup() {
    const calls: { url: string; body: string }[] = []
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push({ url, body: String(init?.body) })
      if (url.endsWith('/photos')) return json({ id: 'photo1', post_id: 'page_post1' })
      if (url.endsWith('/comments')) return json({ error: { message: '(#200) You do not have sufficient permissions', code: 200 } }, false, 403)
      return json({ success: true })
    })
    const saved: Record<string, unknown>[] = []
    const payload = { upsertSocialPost: async (b: Record<string, unknown>) => void saved.push(b) } as unknown as PayloadClient
    const env = { META_PAGE_ID: 'page', META_PAGE_TOKEN: 'tok', FB_LINK_IN_COMMENT: true } as unknown as WorkerEnv
    return { calls, saved, run: () => postFacebook(input, { env, payload, commentWaitMs: [0, 0, 0] }) }
  }
  it('edits the post to add the link, logs the error and pauses comments', async () => {
    const { calls, saved, run } = setup()
    await run()
    const edit = calls.find((c) => c.url.endsWith('/page_post1'))!
    expect(new URLSearchParams(edit.body).get('message')).toContain(`Read the full story: ${input.url}`)
    expect(saved[0]).toMatchObject({ status: 'posted' })
    expect(String(saved[0]!.error)).toContain('link comment failed')
    expect(String(saved[0]!.copy)).toContain(input.url)
    expect(commentsBlocked()).toBe(true)
  })
  it('while paused the next post carries the link in the caption and makes no comment call', async () => {
    const { calls, saved, run } = setup()
    await run()
    calls.length = 0
    await run()
    expect(calls).toHaveLength(1)
    expect(new URLSearchParams(calls[0]!.body).get('caption')).toContain(input.url)
    expect(saved[1]!.error).toBeUndefined()
  })
  it('tries comments again after the pause', async () => {
    const { run } = setup()
    await run()
    expect(commentsBlocked(Date.now() + 7 * 3600_000)).toBe(false)
  })
})
