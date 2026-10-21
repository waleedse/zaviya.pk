import type { Payload } from 'payload'
import type { Priority } from '@zaviya/shared'

/** A story is breaking for this long after it was published (ZAV-143). */
export const BREAKING_MAX_HOURS = 24

/**
 * Priority-only update (ZAV-143): writes just `priority` / `isBreaking` in the English locale, so the editor never has
 * to resend title, dek and body (a PATCH that did used to fail on Title/Slug or wipe text; keepArticleText also guards).
 */
export async function setArticlePriority(
  payload: Payload,
  id: string,
  priority: Priority,
  isBreaking?: boolean,
  actor = 'agent:priority',
): Promise<{ id: string; priority: Priority; isBreaking: boolean; changed: boolean }> {
  const doc = await payload.findByID({ collection: 'articles', id, locale: 'en', depth: 0, overrideAccess: true })
  const nextBreaking = priority === 'breaking' ? true : (isBreaking ?? Boolean(doc.isBreaking))
  const changed = doc.priority !== priority || Boolean(doc.isBreaking) !== nextBreaking
  if (changed) {
    await payload.update({
      collection: 'articles',
      id,
      locale: 'en',
      data: { priority, isBreaking: nextBreaking },
      overrideAccess: true,
    })
    await payload
      .create({
        collection: 'audit-log',
        data: {
          entity: 'articles',
          entityId: id,
          action: 'priority',
          actor,
          payload: { from: { priority: doc.priority, isBreaking: doc.isBreaking }, to: { priority, isBreaking: nextBreaking } },
          at: new Date().toISOString(),
        },
        overrideAccess: true,
      })
      .catch((e) => console.error('[priority] could not write audit-log', id, e))
  }
  return { id, priority, isBreaking: nextBreaking, changed }
}

/** Drops the breaking flag (and priority breaking -> high) on published stories older than BREAKING_MAX_HOURS. */
export async function expireBreaking(payload: Payload, now = Date.now(), maxHours = BREAKING_MAX_HOURS): Promise<number[]> {
  const before = new Date(now - maxHours * 3_600_000).toISOString()
  const res = await payload.find({
    collection: 'articles',
    where: {
      and: [
        { _status: { equals: 'published' } },
        { publishedAt: { less_than: before } },
        { or: [{ isBreaking: { equals: true } }, { priority: { equals: 'breaking' } }] },
      ],
    },
    locale: 'en',
    depth: 0,
    limit: 100,
    overrideAccess: true,
  })
  const done: number[] = []
  for (const a of res.docs) {
    const priority = (a.priority === 'breaking' ? 'high' : a.priority ?? 'normal') as Priority
    await setArticlePriority(payload, String(a.id), priority, false, 'system:breaking-expiry')
    done.push(Number(a.id))
  }
  return done
}
