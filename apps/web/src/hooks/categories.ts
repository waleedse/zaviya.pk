import type { CollectionAfterChangeHook } from 'payload'
import { revalidateCategory, revalidateHome } from '../lib/revalidate'

export const categoryAfterChange: CollectionAfterChangeHook = async ({ doc, context }) => {
  if (context?.skipRevalidate) return doc
  if (doc.slug) await revalidateCategory(String(doc.slug))
  await revalidateHome()
  return doc
}
