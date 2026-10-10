import type { CollectionAfterChangeHook, Payload } from 'payload'

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

async function buildArticleUrls(payload: Payload, doc: Record<string, unknown>): Promise<string[]> {
  const category = doc.category
  let categorySlug = ''
  if (typeof category === 'object' && category !== null && 'slug' in category) {
    categorySlug = String((category as { slug: string }).slug)
  } else if (category) {
    const cat = await payload.findByID({
      collection: 'categories',
      id: String(category),
      depth: 0,
      overrideAccess: true,
    })
    categorySlug = String(cat.slug)
  }
  const urls: string[] = []
  const slug = doc.slug as Record<string, string> | string | undefined
  if (typeof slug === 'object' && slug?.en) urls.push(`${siteUrl()}/${categorySlug}/${slug.en}`)
  if (typeof slug === 'object' && slug?.ur) urls.push(`${siteUrl()}/ur/${categorySlug}/${slug.ur}`)
  return urls
}

export const pingIndexNowOnFirstPublish: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
}) => {
  const key = process.env.INDEXNOW_KEY
  if (!key) return doc
  if (doc._status !== 'published') return doc
  if (previousDoc?._status === 'published') return doc

  const urlList = await buildArticleUrls(req.payload, doc as Record<string, unknown>)
  if (urlList.length === 0) return doc

  try {
    await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host: new URL(siteUrl()).host,
        key,
        keyLocation: `${siteUrl()}/${key}.txt`,
        urlList,
      }),
    })
  } catch (err) {
    req.payload.logger.error({ err }, 'IndexNow ping failed')
  }
  return doc
}
