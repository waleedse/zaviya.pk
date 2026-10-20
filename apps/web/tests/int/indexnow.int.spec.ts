import { describe, expect, it, vi } from 'vitest'
import { IndexNowBatcher, MAX_URLS_PER_PING, MIN_PING_INTERVAL_MS, buildIndexNowPayload, indexNowEnabled, urlsForArticle } from '../../src/lib/indexnow'

const SITE = 'https://zaviya.pk'
const KEY = 'abcdef0123456789'

describe('IndexNow (ZAV-146)', () => {
  it('builds the payload with host, key, keyLocation and de-duplicated urls (max 100)', () => {
    const urls = Array.from({ length: 150 }, (_, i) => `${SITE}/a/${i}`)
    const p = buildIndexNowPayload(`${SITE}/`, KEY, [...urls, urls[0]!])
    expect(p).toMatchObject({ host: 'zaviya.pk', key: KEY, keyLocation: `${SITE}/${KEY}.txt` })
    expect(p.urlList).toHaveLength(MAX_URLS_PER_PING)
  })

  it('pings the article, home, about and the category page', () => {
    expect(urlsForArticle(SITE, { categorySlug: 'business', slug: { en: 'petrol', ur: 'petrol-ur' } })).toEqual([
      `${SITE}/`,
      `${SITE}/about`,
      `${SITE}/business`,
      `${SITE}/business/petrol`,
      `${SITE}/ur/business/petrol-ur`,
    ])
  })

  it('needs the key and respects the INDEXNOW=off kill switch', () => {
    expect(indexNowEnabled({})).toBe(false)
    expect(indexNowEnabled({ INDEXNOW_KEY: KEY })).toBe(true)
    expect(indexNowEnabled({ INDEXNOW_KEY: KEY, INDEXNOW: 'off' })).toBe(false)
  })

  it('sends one batch, then waits a minute before the next, and ignores failures', async () => {
    vi.useFakeTimers()
    let t = 1_000_000
    const fetchFn = vi.fn().mockResolvedValueOnce({ ok: true, status: 202 }).mockRejectedValueOnce(new Error('boom'))
    const log = vi.fn()
    const b = new IndexNowBatcher({ siteUrl: () => SITE, env: () => ({ INDEXNOW_KEY: KEY }), fetchFn: fetchFn as unknown as typeof fetch, now: () => t, log })
    b.add([`${SITE}/a`, `${SITE}/a`, `${SITE}/b`])
    expect(b.size).toBe(2)
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetchFn.mock.calls[0]![1].body).urlList).toEqual([`${SITE}/a`, `${SITE}/b`])
    // more urls right after: held back until a minute has passed
    t += 10_000
    b.add([`${SITE}/c`])
    await vi.advanceTimersByTimeAsync(MIN_PING_INTERVAL_MS - 20_000)
    expect(fetchFn).toHaveBeenCalledTimes(1)
    t += MIN_PING_INTERVAL_MS
    await vi.advanceTimersByTimeAsync(MIN_PING_INTERVAL_MS)
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(log).toHaveBeenCalledWith('warn', 'IndexNow ping failed', expect.anything())
    vi.useRealTimers()
  })

  it('does nothing when disabled', async () => {
    const fetchFn = vi.fn()
    const b = new IndexNowBatcher({ siteUrl: () => SITE, env: () => ({ INDEXNOW_KEY: KEY, INDEXNOW: 'off' }), fetchFn: fetchFn as unknown as typeof fetch })
    b.add([`${SITE}/a`])
    expect(b.size).toBe(0)
    expect(await b.flush()).toBeUndefined()
    expect(fetchFn).not.toHaveBeenCalled()
  })
})
