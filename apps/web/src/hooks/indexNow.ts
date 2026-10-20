import type { CollectionAfterChangeHook, Payload } from 'payload'
import { IndexNowBatcher, indexNowEnabled, urlsForArticle } from '../lib/indexnow'

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

/** One batcher per server process: up to 100 URLs per ping, at most one ping a minute (ZAV-146) */
export const indexNowBatcher = new IndexNowBatcher({
  siteUrl,
  log: (level, msg, extra) => console[level === 'warn' ? 'warn' : 'info'](`[indexnow] ${msg}`, extra ?? ''),
})

async function categorySlugOf(payload: Payload, category: unknown): Promise<string> {
  if (typeof category === 'object' && category !== null && 'slug' in category) return String((category as { slug: string }).slug)
  if (!category) return ''
  const cat = await payload.findByID({ collection: 'categories', id: String(category), depth: 0, overrideAccess: true })
  return String(cat.slug)
}

/** Pings IndexNow when an article goes live and again when a live article changes. Never blocks or fails the save. */
export const pingIndexNowOnFirstPublish: CollectionAfterChangeHook = async ({ doc, req }) => {
  if (!indexNowEnabled() || doc._status !== 'published') return doc
  try {
    const slug = doc.slug as Record<string, string> | string | undefined
    const urls = urlsForArticle(siteUrl(), {
      categorySlug: await categorySlugOf(req.payload, doc.category),
      slug: typeof slug === 'object' ? slug : undefined,
    })
    indexNowBatcher.add(urls)
  } catch (err) {
    req.payload.logger.warn({ err }, 'IndexNow queue failed')
  }
  return doc
}
