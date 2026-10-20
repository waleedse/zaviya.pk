/**
 * IndexNow (ZAV-146): tell Bing, Yandex and the other IndexNow engines about new and changed pages at once.
 * URLs are collected, de-duplicated and sent in one POST of at most 100, never more than once a minute.
 * Failures are only logged; publishing never waits for or depends on this. Kill switch: INDEXNOW=off.
 * The key comes from INDEXNOW_KEY and is served at /<key>.txt (see /api/indexnow/[key] and the rewrite in next.config).
 */
export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow'
export const MAX_URLS_PER_PING = 100
export const MIN_PING_INTERVAL_MS = 60_000

export interface IndexNowEnv {
  INDEXNOW?: string
  INDEXNOW_KEY?: string
}

export const indexNowEnabled = (env: IndexNowEnv = process.env as IndexNowEnv) =>
  Boolean(env.INDEXNOW_KEY) && (env.INDEXNOW ?? '').toLowerCase() !== 'off'

export function buildIndexNowPayload(siteUrl: string, key: string, urls: string[]) {
  const origin = siteUrl.replace(/\/$/, '')
  return {
    host: new URL(origin).host,
    key,
    keyLocation: `${origin}/${key}.txt`,
    urlList: [...new Set(urls)].slice(0, MAX_URLS_PER_PING),
  }
}

/** Pages worth re-crawling whenever an article goes live or changes: the article itself, plus home, about and its category. */
export function urlsForArticle(siteUrl: string, article: { categorySlug?: string; slug?: { en?: string; ur?: string } }): string[] {
  const o = siteUrl.replace(/\/$/, '')
  const urls = [`${o}/`, `${o}/about`]
  if (article.categorySlug) urls.push(`${o}/${article.categorySlug}`)
  if (article.categorySlug && article.slug?.en) urls.push(`${o}/${article.categorySlug}/${article.slug.en}`)
  if (article.categorySlug && article.slug?.ur) urls.push(`${o}/ur/${article.categorySlug}/${article.slug.ur}`)
  return urls
}

export class IndexNowBatcher {
  private pending = new Set<string>()
  private lastSentAt = 0
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(
    private readonly opts: {
      siteUrl: () => string
      env?: () => IndexNowEnv
      fetchFn?: typeof fetch
      now?: () => number
      log?: (level: 'info' | 'warn', msg: string, extra?: Record<string, unknown>) => void
    },
  ) {}

  private env() {
    return this.opts.env?.() ?? (process.env as IndexNowEnv)
  }

  add(urls: string[]): void {
    if (!indexNowEnabled(this.env())) return
    for (const u of urls) this.pending.add(u)
    this.schedule()
  }

  /** Number of URLs waiting (for tests) */
  get size() {
    return this.pending.size
  }

  private schedule() {
    if (this.timer || this.pending.size === 0) return
    const now = (this.opts.now ?? Date.now)()
    const wait = Math.max(0, this.lastSentAt + MIN_PING_INTERVAL_MS - now)
    this.timer = setTimeout(() => {
      this.timer = undefined
      void this.flush()
    }, wait)
    this.timer.unref?.()
  }

  /** Sends up to 100 waiting URLs; returns the HTTP status, or undefined when nothing was sent. Never throws. */
  async flush(): Promise<number | undefined> {
    const env = this.env()
    if (!indexNowEnabled(env) || this.pending.size === 0) return undefined
    const batch = [...this.pending].slice(0, MAX_URLS_PER_PING)
    batch.forEach((u) => this.pending.delete(u))
    this.lastSentAt = (this.opts.now ?? Date.now)()
    let status: number | undefined
    try {
      const res = await (this.opts.fetchFn ?? fetch)(INDEXNOW_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(buildIndexNowPayload(this.opts.siteUrl(), env.INDEXNOW_KEY!, batch)),
        signal: AbortSignal.timeout(10_000),
      })
      status = res.status
      this.opts.log?.(res.ok ? 'info' : 'warn', `IndexNow ping ${res.status}`, { urls: batch.length })
    } catch (err) {
      this.opts.log?.('warn', 'IndexNow ping failed', { err: err instanceof Error ? err.message : String(err) })
    }
    this.schedule()
    return status
  }
}
