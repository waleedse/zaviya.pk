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

/** A live story with no live update (or, without updates, no publication) for this long is over (ZAV-214). */
export const LIVE_MAX_HOURS = 4

/** The last time a live story moved: its newest live update, else its publish time. */
export function lastLiveActivity(a: { publishedAt?: string | null; updates?: { at?: string | null }[] | null }): number {
  const times = [a.publishedAt, ...(a.updates ?? []).map((u) => u.at)].map((t) => (t ? Date.parse(t) : NaN)).filter((t) => !Number.isNaN(t))
  return times.length ? Math.max(...times) : 0
}

/**
 * Clears isLive on published stories whose last live update is older than LIVE_MAX_HOURS. Writes only the isLive flag in
 * the English locale (never title, body or priority), so finished stories lose the LIVE badge without a full PATCH.
 */
export async function expireLive(payload: Payload, now = Date.now(), maxHours = LIVE_MAX_HOURS): Promise<number[]> {
  const res = await payload.find({
    collection: 'articles',
    where: { and: [{ _status: { equals: 'published' } }, { isLive: { equals: true } }] },
    locale: 'en',
    depth: 0,
    limit: 100,
    overrideAccess: true,
  })
  const done: number[] = []
  for (const a of res.docs) {
    if (now - lastLiveActivity(a) < maxHours * 3_600_000) continue
    await payload.update({ collection: 'articles', id: a.id, locale: 'en', data: { isLive: false }, overrideAccess: true })
    await payload
      .create({
        collection: 'audit-log',
        data: {
          entity: 'articles',
          entityId: String(a.id),
          action: 'live-expired',
          actor: 'system:live-expiry',
          payload: { from: { isLive: true }, to: { isLive: false }, maxHours },
          at: new Date(now).toISOString(),
        },
        overrideAccess: true,
      })
      .catch((e) => console.error('[live-expiry] could not write audit-log', a.id, e))
    done.push(Number(a.id))
  }
  return done
}
