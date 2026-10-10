import type { CollectionBeforeValidateHook, CollectionAfterChangeHook } from 'payload'
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
