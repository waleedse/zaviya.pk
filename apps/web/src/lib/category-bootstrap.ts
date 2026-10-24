import type { Payload } from 'payload'
import { CATEGORIES } from '@zaviya/shared'

/**
 * Slugs added after the first release (ZAV-201). Their enum value is added in `onInit` and the row
 * is created here, so a new section needs no Payload migration. `after` puts the nav entry after
 * another category: orders are numbers, so it sits at that category's order + 0.5.
 */
export const BOOTSTRAP_CATEGORIES = [{ slug: 'sports', after: 'cricket' }] as const

/** Create the missing bootstrap categories (en + ur name). Safe to run on every boot. */
export async function ensureBootstrapCategories(payload: Payload): Promise<string[]> {
  const created: string[] = []
  for (const b of BOOTSTRAP_CATEGORIES) {
    const meta = CATEGORIES.find((c) => c.slug === b.slug)
    if (!meta) continue
    const found = await payload.find({ collection: 'categories', where: { slug: { equals: b.slug } }, limit: 1, depth: 0, locale: 'en' })
    if (found.docs[0]) continue
    const anchor = await payload.find({ collection: 'categories', where: { slug: { equals: b.after } }, limit: 1, depth: 0, locale: 'en' })
    const order = (anchor.docs[0]?.order ?? CATEGORIES.findIndex((c) => c.slug === b.after)) + 0.5
    const doc = await payload.create({
      collection: 'categories',
      locale: 'en',
      context: { skipRevalidate: true },
      data: { slug: b.slug, color: meta.color, order, showInNav: true, name: meta.en, description: `${meta.en} news from Zaviya` },
    })
    await payload.update({
      collection: 'categories',
      id: doc.id,
      locale: 'ur',
      context: { skipRevalidate: true },
      data: { name: meta.ur },
    })
    created.push(b.slug)
  }
  return created
}
