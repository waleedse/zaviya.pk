import type { CollectionAfterChangeHook } from 'payload'
import { revalidateAppliancePages } from '../lib/revalidate'

/** Prices changed in admin: refresh the price pages on their next visit */
export const revalidateAppliancesHook: CollectionAfterChangeHook = async ({ doc, context }) => {
  // The importer revalidates once per batch
  if (context?.skipRevalidate) return doc
  await revalidateAppliancePages()
  return doc
}
