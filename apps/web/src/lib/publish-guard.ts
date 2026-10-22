/**
 * Publish idempotency (ZAV-158).
 *
 * On 21 Oct 20:04 UTC the web server was slow, the worker's POST /api/pipeline/articles timed out and BullMQ ran the
 * publish job again while the first request was still being served. Both requests created an article for cluster 11509
 * (1476 and 1477, same title and slug, 4 s apart). Each later update of 1477 then failed with a 500, because the
 * slug-unique hook found 1476 holding the same slug, so even a status PATCH could not unpublish it.
 */

/** A cluster that already has a live or waiting article this recent does not get a second one from the publish path. */
export const DUPLICATE_WINDOW_MS = 15 * 60_000

/**
 * Runs `fn` after every earlier call with the same key has finished (one web process serves the pipeline API, so an
 * in-process queue is enough to make "check, then create" atomic per cluster).
 */
const tails = new Map<string, Promise<unknown>>()
export async function withKeyLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = tails.get(key) ?? Promise.resolve()
  const run = prev.catch(() => undefined).then(fn)
  const tail = run.catch(() => undefined)
  tails.set(key, tail)
  try {
    return await run
  } finally {
    if (tails.get(key) === tail) tails.delete(key)
  }
}

export interface ExistingArticle {
  id: number | string
  createdAt?: string | null
  workflow?: string | null
}

/**
 * The article that makes a new create for the same cluster a duplicate, or undefined. Only a published or
 * in-review article counts: a rejected draft (workflow back to draft) lets the cluster be written again (ZAV-54).
 */
export function findDuplicate(candidates: ExistingArticle[], now = Date.now()): ExistingArticle | undefined {
  return candidates.find((a) => {
    const t = a.createdAt ? Date.parse(a.createdAt) : NaN
    return (a.workflow === 'published' || a.workflow === 'in_review') && Number.isFinite(t) && now - t <= DUPLICATE_WINDOW_MS
  })
}

/**
 * The slug this document already holds for a locale, from the document the hook was given (a string when the
 * request has one locale, an object per locale otherwise), or undefined when it cannot tell.
 */
export function savedSlug(originalDoc: { slug?: unknown } | undefined, locale: string, requestLocale?: string): string | undefined {
  const s = originalDoc?.slug
  if (s && typeof s === 'object') {
    const v = (s as Record<string, unknown>)[locale]
    return typeof v === 'string' ? v : undefined
  }
  if (typeof s === 'string' && (!requestLocale || requestLocale === locale)) return s
  return undefined
}
