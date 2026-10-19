import { describe, expect, it } from 'vitest'
import { classifyComment, MAX_REPLIES_PER_DAY, pickReply, runCommentReplies, TEMPLATES, type KV } from './comments.js'
import type { WorkerEnv } from '../config.js'
import type { PayloadClient } from '../payload-client.js'

function memKv(): KV & { m: Map<string, string> } {
  const m = new Map<string, string>()
  return {
    m,
    get: async (k) => m.get(k) ?? null,
    set: async (k, v) => void m.set(k, v),
    setNx: async (k, v) => (m.has(k) ? false : (m.set(k, v), true)),
    incr: async (k) => {
      const n = Number(m.get(k) ?? 0) + 1
      m.set(k, String(n))
      return n
    },
    expire: async () => undefined,
  }
}

describe('classifyComment', () => {
  it('finds questions, praise and complaints', () => {
    expect(classifyComment('Will petrol get cheaper next month?')).toMatchObject({ action: 'reply', sentiment: 'question', urdu: false })
    expect(classifyComment('Great update, thanks')).toMatchObject({ sentiment: 'praise' })
    expect(classifyComment('this is fake news')).toMatchObject({ sentiment: 'negative' })
    expect(classifyComment('hmm ok')).toMatchObject({ sentiment: 'neutral' })
    expect(classifyComment('کیا پیٹرول سستا ہوگا')).toMatchObject({ sentiment: 'question', urdu: true })
  })
  it('hides spam and links, leaves abuse and politics alone', () => {
    expect(classifyComment('Earn $500 daily click here')).toEqual({ action: 'hide' })
    expect(classifyComment('visit mysite.com now')).toEqual({ action: 'hide' })
    expect(classifyComment('you idiot')).toMatchObject({ action: 'skip', reason: 'abuse' })
    expect(classifyComment('PTI zindabad')).toMatchObject({ action: 'skip', reason: 'politics' })
  })
})

describe('pickReply', () => {
  it('never repeats the last reply and answers in the commenter language', () => {
    for (const sentiment of Object.keys(TEMPLATES) as (keyof typeof TEMPLATES)[]) {
      for (const [en, ur] of TEMPLATES[sentiment]) {
        for (let i = 0; i < 20; i++) {
          expect(pickReply(sentiment, false, en)).not.toBe(en)
          expect(pickReply(sentiment, true, ur)).not.toBe(ur)
        }
      }
    }
    expect(pickReply('praise', true, null)).toMatch(/[؀-ۿ]/)
  })
  it('has 10 templates in total', () => {
    expect(Object.values(TEMPLATES).flat()).toHaveLength(10)
  })
})

describe('runCommentReplies', () => {
  const now = Date.parse('2026-10-19T12:00:00Z')
  const env = { META_PAGE_ID: 'page1', META_PAGE_TOKEN: 'tok', COMMENT_REPLIES: true } as unknown as WorkerEnv
  const payload = {
    getRecentSocialPosts50h: async () => ({ posts: [{ id: 1, platform: 'facebook', externalId: 'page1_10', postedAt: new Date(now - 3_600_000).toISOString(), metrics: null }] }),
  } as unknown as PayloadClient
  const created = new Date(now - 10 * 60_000).toISOString()

  function fakeFetch(comments: unknown[]) {
    const calls: { url: string; body?: string }[] = []
    const fn = (async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body?.toString() })
      if (init?.method === 'POST') return { ok: true, status: 200, json: async () => ({ id: 'r1', success: true }) }
      return { ok: true, status: 200, json: async () => ({ data: comments }) }
    }) as unknown as typeof fetch
    return { fn, calls }
  }

  it('replies once per comment, skips the Page itself, hides spam, and does not reply twice on the next run', async () => {
    const kv = memKv()
    const { fn, calls } = fakeFetch([
      { id: 'c1', message: 'Will it rain tomorrow?', from: { id: 'u1' }, created_time: created },
      { id: 'c2', message: 'https://scam.example', from: { id: 'u2' }, created_time: created },
      { id: 'c3', message: 'link here', from: { id: 'page1' }, created_time: created },
      { id: 'c4', message: 'old one?', from: { id: 'u3' }, created_time: new Date(now - 72 * 3_600_000).toISOString() },
    ])
    const r1 = await runCommentReplies({ env, payload, kv, fetchFn: fn, now })
    expect(r1).toMatchObject({ replied: 1, hidden: 1 })
    expect(calls.filter((c) => c.url.endsWith('/c1/comments'))).toHaveLength(1)
    expect(calls.some((c) => c.url.endsWith('/c2') && c.body?.includes('is_hidden=true'))).toBe(true)
    expect(calls.some((c) => c.url.includes('/c3'))).toBe(false)
    const r2 = await runCommentReplies({ env, payload, kv, fetchFn: fn, now })
    expect(r2).toMatchObject({ replied: 0, hidden: 0 })
  })

  it('stops at the daily limit and honours the kill switch', async () => {
    const kv = memKv()
    kv.m.set('commentreplies:count:2026-10-19', String(MAX_REPLIES_PER_DAY))
    const { fn, calls } = fakeFetch([{ id: 'c9', message: 'nice', from: { id: 'u1' }, created_time: created }])
    expect(await runCommentReplies({ env, payload, kv, fetchFn: fn, now })).toMatchObject({ limit: true, replied: 0 })
    expect(calls).toHaveLength(0)
    expect(await runCommentReplies({ env: { ...env, COMMENT_REPLIES: false } as WorkerEnv, payload, kv: memKv(), fetchFn: fn, now })).toMatchObject({ disabled: true })
  })
})
