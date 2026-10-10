import type { CollectionAfterChangeHook } from 'payload'
import { revalidateArticle, revalidateCategory, revalidateHome, revalidateDataTag } from '../lib/revalidate'

const SERIES_TO_DATA_KEY: Record<string, string> = {
  gold_24k_tola: 'gold',
  gold_22k_tola: 'gold',
  usd_interbank: 'usd-pkr',
  usd_open_buy: 'usd-pkr',
  usd_open_sell: 'usd-pkr',
  petrol_super: 'petrol',
  hsd: 'petrol',
  kerosene: 'petrol',
}

export const revalidateArticleHook: CollectionAfterChangeHook = async ({ doc, previousDoc, req }) => {
  const id = String(doc.id)
  await revalidateArticle(id)
  await revalidateHome()
  const cat = doc.category
  const catId = typeof cat === 'object' && cat !== null ? (cat as { slug?: string }).slug : undefined
  if (catId) await revalidateCategory(String(catId))
  if (previousDoc?.category && previousDoc.category !== doc.category) {
    const prev = previousDoc.category
    const prevSlug = typeof prev === 'object' && prev !== null ? (prev as { slug?: string }).slug : undefined
    if (prevSlug) await revalidateCategory(String(prevSlug))
  }
  return doc
}

export const revalidateDataPoint: CollectionAfterChangeHook = async ({ doc }) => {
  const series = doc.series as string | undefined
  if (series) {
    const key = SERIES_TO_DATA_KEY[series]
    if (key) await revalidateDataTag(key)
  }
  return doc
}
