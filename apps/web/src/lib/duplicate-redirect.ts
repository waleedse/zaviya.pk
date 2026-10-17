import type { Locale } from '@zaviya/shared'
import { articleHref } from './mock'

/** The slice of the Payload local API this lookup needs (keeps it testable without a database). */
export interface FindApi {
  find(args: {
    collection: 'articles'
    locale: Locale
    where: Record<string, unknown>
    sort?: string
    limit: number
    depth: number
    overrideAccess: true
  }): Promise<{ docs: Record<string, any>[] }>
}

const idOf = (v: unknown): string | number | undefined =>
  v && typeof v === 'object' ? (v as { id?: string | number }).id : (v as string | number | undefined)

/**
 * ZAV-92: a URL that is no longer published answers 301 to the live article of the same story when one
 * exists (the removed article was a duplicate), otherwise null so the page 404s. Retracted articles
 * (takedowns) never redirect.
 */
export async function findReplacementHref(api: FindApi, locale: Locale, slug: string): Promise<string | null> {
  const gone = await api.find({
    collection: 'articles',
    locale,
    where: { and: [{ slug: { equals: slug } }, { _status: { not_equals: 'published' } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const doc = gone.docs[0]
  const clusterId = idOf(doc?.storyCluster)
  if (!doc || clusterId === undefined || doc.workflow === 'retracted') return null
  const live = await api.find({
    collection: 'articles',
    locale,
    where: {
      and: [
        { storyCluster: { equals: clusterId } },
        { _status: { equals: 'published' } },
        { workflow: { not_equals: 'retracted' } },
        { id: { not_equals: doc.id } },
      ],
    },
    sort: '-publishedAt',
    limit: 1,
    depth: 1,
    overrideAccess: true,
  })
  const kept = live.docs[0]
  const category = kept?.category && typeof kept.category === 'object' ? (kept.category as { slug?: string }).slug : undefined
  const keptSlug = typeof kept?.slug === 'string' ? kept.slug : undefined
  if (!category || !keptSlug) return null
  return articleHref(locale, category, keptSlug)
}
