import type { CategorySlug, Priority } from '@zaviya/shared'
import { logger } from './logger.js'

export interface PipelineSource {
  id: string
  key?: string
  name: string
  url: string
  type: string
  trustTier: 1 | 2 | 3
  language?: string
  categoryHint?: string
  pollIntervalSec: number
  etag?: string | null
  lastPolledAt?: string | null
}

export interface SourceItemInput {
  sourceId: string
  externalId: string
  url: string
  title: string
  summary?: string
  contentText?: string
  publishedAt: string
  lang: string
  hash: string
}

export interface ClusterItem {
  id: string
  title: string
  url: string
  summary?: string
  contentText?: string
  publishedAt: string
  source: { name: string; trustTier: 1 | 2 | 3 }
}

export interface ClusterDetail {
  id: string
  headline?: string
  status: string
  itemCount: number
  distinctSources: number
  maxTier: 1 | 2 | 3
  triage?: unknown
  article?: string | null
  items: ClusterItem[]
}

export interface PipelineArticleLocale {
  title: string
  titleVariants: string[]
  slug: string
  dek: string
  keyPoints: string[]
  bodyMarkdown: string
  whatItMeans: string
  faqs: { q: string; a: string }[]
  tags: string[]
  metaDescription?: string
  altText?: string
}

export interface PipelineArticleInput {
  articleId?: string
  clusterId?: string
  category: CategorySlug
  priority: Priority
  isBreaking?: boolean
  isLive?: boolean
  status: 'draft' | 'in_review' | 'published'
  heroMediaId?: string
  sources: { name: string; url: string; tier: 1 | 2 | 3; publishedAt?: string }[]
  embeds?: { type: 'x' | 'instagram' | 'youtube'; url: string }[]
  ai: {
    model: string
    promptVersion: string
    triageScore?: number
    qaScore?: number
    originality?: number
    generatedAt: string
  }
  locales: Partial<Record<'en' | 'ur', PipelineArticleLocale>>
}

export interface PipelineSettings {
  thresholds?: { publish?: number; review?: number }
  dailyCaps?: Record<string, number>
  publishWindow?: { start: string; end: string }
  minIntervalMin?: number
  activeModels?: Record<string, string>
  killSwitch?: boolean
  categoryWeights?: Record<string, number>
  lastPublishedAt?: string
  articlesPublishedToday?: number
}

export class PayloadClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey?: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  private headers(json = true): HeadersInit {
    const h: Record<string, string> = {}
    if (json) h['Content-Type'] = 'application/json'
    if (this.apiKey) h.Authorization = `users API-Key ${this.apiKey}`
    return h
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    opts?: { timeoutMs?: number; retries?: number },
  ): Promise<T> {
    const timeoutMs = opts?.timeoutMs ?? 30_000
    const retries = opts?.retries ?? 3
    let lastErr: unknown
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const res = await this.fetchFn(`${this.baseUrl}${path}`, {
          method,
          headers: this.headers(body !== undefined && !(body instanceof FormData)),
          body:
            body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(timeoutMs),
        })
        if (res.status >= 500 && attempt < retries - 1) {
          await sleep(500 * 2 ** attempt)
          continue
        }
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          throw new Error(`Payload ${method} ${path} failed (${res.status}): ${text}`)
        }
        if (res.status === 204) return undefined as T
        return (await res.json()) as T
      } catch (e) {
        lastErr = e
        if (attempt < retries - 1) await sleep(500 * 2 ** attempt)
      }
    }
    throw lastErr
  }

  getSources() {
    return this.request<{ sources: PipelineSource[] }>('GET', '/api/pipeline/sources')
  }

  patchSource(id: string, body: { etag?: string; lastPolledAt?: string }) {
    return this.request<{ ok: true }>('PATCH', `/api/pipeline/sources/${id}`, body)
  }

  postSourceItems(items: SourceItemInput[]) {
    return this.request<{ inserted: { id: string; externalId: string }[]; skipped: number }>(
      'POST',
      '/api/pipeline/source-items',
      { items },
    )
  }

  clusterMatch(body: {
    sourceItemId: string
    embedding: number[]
    windowHours?: number
    threshold?: number
  }) {
    return this.request<{ clusterId: string; isNew: boolean; similarity: number }>(
      'POST',
      '/api/pipeline/cluster-match',
      body,
    )
  }

  getCluster(id: string) {
    return this.request<ClusterDetail>('GET', `/api/pipeline/clusters/${id}`)
  }

  patchCluster(
    id: string,
    body: { status?: string; triage?: unknown; article?: string },
  ) {
    return this.request<{ ok: true }>('PATCH', `/api/pipeline/clusters/${id}`, body)
  }

  postArticle(input: PipelineArticleInput) {
    return this.request<{ id: string; status: string; urls: { en?: string; ur?: string } }>(
      'POST',
      '/api/pipeline/articles',
      input,
    )
  }

  postLiveUpdate(id: string, body: { at: string; text: { en?: string; ur?: string } }) {
    return this.request<{ ok: true }>('POST', `/api/pipeline/articles/${id}/live-update`, body)
  }

  postReview(body: { clusterId: string; articleId?: string; reason: string; flags: string[] }) {
    return this.request<{ id: string }>('POST', '/api/pipeline/review', body)
  }

  patchReview(
    id: string,
    body: { decision: string; decidedBy: string; telegramMessageId?: string },
  ) {
    return this.request<{ ok: true; clusterId: string; articleId?: string }>(
      'PATCH',
      `/api/pipeline/review/${id}`,
      body,
    )
  }

  internalLinks(keywords: string[], locale: 'en' | 'ur', limit = 5) {
    return this.request<{ links: { title: string; url: string }[] }>(
      'POST',
      '/api/pipeline/internal-links',
      { keywords, locale, limit },
    )
  }

  titleCheck(title: string, locale: 'en' | 'ur') {
    return this.request<{ maxSimilarity: number; closest?: { title: string; url: string } }>(
      'POST',
      '/api/pipeline/title-check',
      { title, locale },
    )
  }

  retract(id: string, reason: string) {
    return this.request<{ socialPosts: { id: string; platform: string; externalId?: string }[] }>(
      'POST',
      `/api/pipeline/retract/${id}`,
      { reason },
    )
  }

  postDataPoints(
    points: {
      series: string
      city?: string
      value: number
      unit: string
      source: string
      observedAt: string
    }[],
  ) {
    return this.request<{ inserted: number }>('POST', '/api/pipeline/data-points', { points })
  }

  upsertSocialPost(body: {
    idempotencyKey: string
    article: string
    platform: string
    format: string
    copy: string
    mediaUrls: string[]
    status: string
    scheduledAt?: string
    postedAt?: string
    externalId?: string
    via?: string
    error?: string
  }) {
    return this.request<{ id: string; created: boolean }>('POST', '/api/pipeline/social-posts', body)
  }

  getSettings() {
    return this.request<PipelineSettings>('GET', '/api/pipeline/settings')
  }

  heartbeat(body: { version: string; queues: Record<string, { waiting: number; active: number; failed: number }> }) {
    return this.request<{ ok: true; killSwitch: boolean }>('POST', '/api/pipeline/heartbeat', body)
  }

  async uploadMedia(file: Blob, meta: {
    alt: string
    credit?: string
    license: string
    isAiGenerated?: boolean
  }): Promise<{ id: string; url?: string | null }> {
    const form = new FormData()
    form.append('file', file)
    form.append('_payload', JSON.stringify(meta))
    const res = await this.fetchFn(`${this.baseUrl}/api/media`, {
      method: 'POST',
      headers: this.headers(false),
      body: form,
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      logger.warn({ status: res.status, text }, 'media upload failed')
      throw new Error(`Media upload failed (${res.status})`)
    }
    const doc = (await res.json()) as {
      doc?: { id?: string; url?: string | null }
      id?: string
      url?: string | null
    }
    const id = doc.doc?.id ?? doc.id
    if (!id) throw new Error('Media upload: missing id')
    const url = doc.doc?.url ?? doc.url ?? null
    return { id: String(id), url }
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
