import { describe, it, expect, vi } from 'vitest'
import { processPublishJob, publishBlocker, finishGated } from './publish.js'

const body = Array.from({ length: 120 }, (_, i) => `word${i}`).join(' ')

describe('publishBlocker', () => {
  it('passes a full article', () => {
    expect(publishBlocker({ en: { bodyMarkdown: body, whatItMeans: 'It matters.' } })).toBeNull()
  })
  it('blocks an empty or short body and an empty whatItMeans', () => {
    expect(publishBlocker({ en: { whatItMeans: 'x' } })).toMatch(/body/)
    expect(publishBlocker({ en: { bodyMarkdown: 'too short', whatItMeans: 'x' } })).toMatch(/body/)
    expect(publishBlocker({ en: { bodyMarkdown: body, whatItMeans: '  ' } })).toMatch(/whatItMeans/)
  })
})

describe('processPublishJob', () => {
  it('does not post an article with an empty body', async () => {
    const payload = {
      getCluster: vi.fn(async () => ({ items: [], triage: {} })),
      postArticle: vi.fn(),
      patchCluster: vi.fn(async () => ({})),
    }
    const write = { en: { bodyMarkdown: '', whatItMeans: '' } }
    const res = await processPublishJob(
      { clusterId: '1', write: write as never, qaScore: 1, priority: 'normal' },
      { payload: payload as never, socialQueue: { add: vi.fn() } as never },
    )
    expect(res).toBeNull()
    expect(payload.postArticle).not.toHaveBeenCalled()
    expect(payload.patchCluster).toHaveBeenCalledWith('1', { status: 'triaged' })
  })
})

describe('finishGated without a waiting entry', () => {
  const redis = { hget: vi.fn(async () => null), hdel: vi.fn() }
  const run = (article: object) => {
    const payload = { request: vi.fn(async (m: string) => (m === 'GET' ? article : {})) }
    return finishGated('9', 'publish', { payload: payload as never, socialQueue: {} as never, redis: redis as never }).then((done) => ({ done, payload }))
  }
  it('moves a stranded in_review draft out of review', async () => {
    const { done, payload } = await run({ _status: 'draft', workflow: 'in_review' })
    expect(done).toBe(false)
    expect(payload.request).toHaveBeenCalledWith('PATCH', expect.stringContaining('/api/articles/9'), { workflow: 'draft' })
  })
  it('leaves a live article alone', async () => {
    const { payload } = await run({ _status: 'published', workflow: 'published' })
    expect(payload.request).toHaveBeenCalledTimes(1)
  })
})
