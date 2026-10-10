import type { CollectionAfterChangeHook } from 'payload'
import { revalidateCategory, revalidateHome } from '../lib/revalidate'

export const categoryAfterChange: CollectionAfterChangeHook = async ({ doc }) => {
  if (doc.slug) await revalidateCategory(String(doc.slug))
  await revalidateHome()
  return doc
}
