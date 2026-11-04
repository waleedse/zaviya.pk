import type { CollectionAfterChangeHook } from 'payload'
import { revalidatePhonePages } from '../lib/revalidate'

/** Prices and specs changed in admin: refresh the mobile pages on their next visit */
export const revalidatePhonesHook: CollectionAfterChangeHook = async ({ doc }) => {
  await revalidatePhonePages()
  return doc
}
