import type { CollectionBeforeValidateHook, CollectionBeforeChangeHook, CollectionAfterChangeHook } from 'payload'
import { computeReadingTimeMinutes } from './readingTime'
import { revalidateArticleHook } from './revalidate'
import { pingIndexNowOnFirstPublish } from './indexNow'

export const articleSlugUnique: CollectionBeforeValidateHook = async ({ data, req, originalDoc }) => {
  const id = originalDoc?.id
  if (!data?.slug) return data
  const locales = ['en', 'ur'] as const
  for (const locale of locales) {
    const slugVal = typeof data.slug === 'object' ? data.slug[locale] : data.slug
    if (!slugVal || typeof slugVal !== 'string') continue
    const existing = await req.payload.find({
      collection: 'articles',
      locale,
      where: {
        slug: { equals: slugVal },
        ...(id ? { id: { not_equals: id } } : {}),
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (existing.docs.length > 0) {
      throw new Error(`Slug "${slugVal}" already exists for locale ${locale}`)
    }
  }
  return data
}

export const articleReadingTime: CollectionBeforeValidateHook = async ({ data }) => {
  if (!data) return data
  const body = data.body
  if (body && typeof body === 'object') {
    const rt: Record<string, number> = {}
    for (const locale of ['en', 'ur'] as const) {
      const localizedBody = (body as Record<string, unknown>)[locale] ?? body
      rt[locale] = computeReadingTimeMinutes(localizedBody)
    }
    data.readingTime = rt.en ?? rt.ur ?? computeReadingTimeMinutes(body)
  }
  return data
}

export const articleAuditLog: CollectionAfterChangeHook = async ({ doc, operation, req, previousDoc }) => {
  const actor = req.user
    ? `user:${req.user.id}`
    : req.headers.get('x-zaviya-actor') ?? 'system'
  let action: string = operation
  if (operation === 'update' && doc._status === 'published' && previousDoc?._status !== 'published') {
    action = 'publish'
  }
  await req.payload.create({
    collection: 'audit-log',
    data: {
      entity: 'articles',
      entityId: String(doc.id),
      action,
      actor,
      at: new Date().toISOString(),
      payload: { workflow: doc.workflow, _status: doc._status },
    },
    overrideAccess: true,
    req,
  })
  return doc
}

export const articleAfterChangeHooks: CollectionAfterChangeHook[] = [
  articleAuditLog,
  revalidateArticleHook,
  pingIndexNowOnFirstPublish,
]

/**
 * A published article never loses its hero image by accident. On 13 Oct the editor agent's edits
 * (headline fixes, "write back" after a gate publish) sent heroImage empty and most live stories went
 * out imageless. An empty value keeps the current image and an object becomes its id. An editor can
 * replace the image but never remove it.
 */
export const keepHeroImage: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  if (!data || !originalDoc || !('heroImage' in data)) return data
  const incoming = data.heroImage as unknown
  if (incoming && typeof incoming === 'object') {
    const id = (incoming as { id?: number | string }).id
    if (id !== undefined) data.heroImage = id
    return data
  }
  const current = originalDoc.heroImage as unknown
  const currentId = current && typeof current === 'object' ? (current as { id?: number | string }).id : current
  if (!incoming && currentId) data.heroImage = currentId
  return data
}
