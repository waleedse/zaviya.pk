import type { CollectionBeforeValidateHook, CollectionBeforeChangeHook, CollectionAfterChangeHook } from 'payload'
import { computeReadingTimeMinutes } from './readingTime'
import { revalidateArticleHook } from './revalidate'
import { pingIndexNowOnFirstPublish } from './indexNow'
import { savedSlug } from '../lib/publish-guard'

export const articleSlugUnique: CollectionBeforeValidateHook = async ({ data, req, originalDoc }) => {
  const id = originalDoc?.id
  if (!data?.slug) return data
  const locales = ['en', 'ur'] as const
  for (const locale of locales) {
    const slugVal = typeof data.slug === 'object' ? data.slug[locale] : data.slug
    if (!slugVal || typeof slugVal !== 'string') continue
    // ZAV-158: an article that already holds this slug may be edited (status, headline, text). Only a slug change
    // can collide; otherwise a duplicate pair (1476/1477) could never be unpublished, every PATCH returned 500.
    if (id) {
      let held = savedSlug(originalDoc, locale, req.locale ?? undefined)
      if (held === undefined) {
        const saved = await req.payload
          .findByID({ collection: 'articles', id, locale, depth: 0, overrideAccess: true })
          .catch(() => undefined)
        held = saved && typeof saved.slug === 'string' ? saved.slug : undefined
      }
      if (held === slugVal) continue
    }
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

const KEEP_TEXT_FIELDS = ['dek', 'keyPoints', 'body', 'whatItMeans', 'faqs'] as const

const hasContent = (v: unknown): boolean => {
  if (v === null || v === undefined || v === '') return false
  if (Array.isArray(v)) return v.length > 0
  return true
}

/**
 * A partial edit (title, slug, priority) never blanks the article text (ZAV-80). On 15 Oct a PATCH
 * without ?locale=en left dek, body and whatItMeans null on articles 868, 817 and 862. When an update
 * leaves one of these fields missing or empty and the saved article has it, the saved value is kept.
 */
export const keepArticleText: CollectionBeforeChangeHook = ({ data, originalDoc, operation }) => {
  if (!data || !originalDoc || operation !== 'update') return data
  for (const f of KEEP_TEXT_FIELDS) {
    if (!hasContent(data[f]) && hasContent(originalDoc[f])) data[f] = originalDoc[f]
  }
  return data
}
