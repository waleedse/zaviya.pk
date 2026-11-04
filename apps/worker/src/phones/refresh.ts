import type { PhoneImportInput } from '@zaviya/shared'
import { logger } from '../logger.js'
import { collectCatalog, makeCtx } from './catalog.js'

export interface PhonePriceChange {
  slug: string
  name: string
  variant: string
  from: number | null
  to: number
}

export interface PhoneRefreshResult {
  phones: number
  created: number
  updated: number
  changes: PhonePriceChange[]
  skipped: { slug: string; variant: string; from: number; to: number; reason: string }[]
  failedBrands: { brand: string; error: string }[]
  dropped: string[]
}

type Request = <T>(method: string, path: string, body?: unknown, opts?: { timeoutMs?: number; retries?: number }) => Promise<T>

/** Posts phones to the web app in small batches (each batch is one request with at most 100 phones) */
export async function postPhones(request: Request, phones: PhoneImportInput[], mode: 'seed' | 'prices', observedAt?: string) {
  const total = { created: 0, updated: 0, changes: [] as PhonePriceChange[], skipped: [] as PhoneRefreshResult['skipped'] }
  for (let i = 0; i < phones.length; i += 25) {
    const res = await request<{ created: number; updated: number; changes: PhonePriceChange[]; skipped: PhoneRefreshResult['skipped'] }>(
      'POST',
      '/api/pipeline/phones/import',
      { phones: phones.slice(i, i + 25), mode, ...(observedAt ? { observedAt } : {}) },
      { timeoutMs: 120_000 },
    )
    total.created += res.created
    total.updated += res.updated
    total.changes.push(...res.changes)
    total.skipped.push(...res.skipped)
  }
  return total
}

/**
 * Daily job: read the official Pakistan sites, send every phone to the web app. The server records a price change in the
 * phone's history only when the official price differs from the stored one, and refuses suspicious jumps.
 * Nothing is ever deleted; a brand site that fails is skipped and tried again tomorrow.
 */
export async function runPhonePrices(request: Request, only?: string[]): Promise<PhoneRefreshResult> {
  const ctx = makeCtx({ log: (obj, msg) => logger.warn(obj, msg) })
  const { phones, failed, dropped } = await collectCatalog(ctx, only)
  if (dropped.length) logger.warn({ dropped }, 'phones: invalid entries dropped')
  if (!phones.length) return { phones: 0, created: 0, updated: 0, changes: [], skipped: [], failedBrands: failed, dropped }
  const res = await postPhones(request, phones, 'prices')
  for (const c of res.changes) logger.info(c, 'phone price change')
  if (res.skipped.length) logger.warn({ skipped: res.skipped }, 'phone price changes skipped (suspicious jump)')
  return { phones: phones.length, ...res, failedBrands: failed, dropped }
}
