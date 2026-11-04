import { PhoneImportBodySchema, phoneSlug, type PhoneImportInput } from '@zaviya/shared'
import pLimit from 'p-limit'
import { ZAVIYA_USER_AGENT } from '../ingest/extract.js'
import { isAllowedByRobots } from '../ingest/robots.js'
import { fetchOppo, fetchRealme, fetchVivo, fetchXiaomi } from './brands.js'
import { fetchSamsung } from './samsung.js'
import type { Adapter, AdapterCtx, FetchText } from './types.js'

/** Official sources, one adapter per brand. A failing adapter never blocks the others. */
export const ADAPTERS: Record<string, Adapter> = {
  samsung: fetchSamsung,
  vivo: fetchVivo,
  realme: fetchRealme,
  oppo: fetchOppo,
  xiaomi: fetchXiaomi,
}

/** Polite fetch: identifies Zaviya, honours robots.txt, 20 s timeout, null on any failure */
export const politeFetchText: FetchText = async (url) => {
  try {
    if (!(await isAllowedByRobots(url))) return null
    const res = await fetch(url, { headers: { 'User-Agent': ZAVIYA_USER_AGENT, Accept: 'text/html,application/xml,*/*' }, redirect: 'follow', signal: AbortSignal.timeout(20_000) })
    return res.ok ? await res.text() : null
  } catch {
    return null
  }
}

export function makeCtx(opts: { fetchText?: FetchText; concurrency?: number; log?: AdapterCtx['log'] } = {}): AdapterCtx {
  const limit = pLimit(opts.concurrency ?? 3)
  return {
    fetchText: opts.fetchText ?? politeFetchText,
    mapLimit: async (items, fn) => {
      await Promise.all(items.map((it) => limit(() => fn(it))))
    },
    log: opts.log ?? (() => {}),
  }
}

export interface CatalogResult {
  phones: PhoneImportInput[]
  failed: { brand: string; error: string }[]
}

/** Runs the adapters and validates every phone with the same schema the server uses; invalid ones are dropped and reported. */
export async function collectCatalog(ctx: AdapterCtx, only?: string[]): Promise<CatalogResult & { dropped: string[] }> {
  const phones: PhoneImportInput[] = []
  const failed: CatalogResult['failed'] = []
  const dropped: string[] = []
  const seen = new Set<string>()
  for (const [brand, adapter] of Object.entries(ADAPTERS)) {
    if (only?.length && !only.includes(brand)) continue
    try {
      for (const p of await adapter(ctx)) {
        const parsed = PhoneImportBodySchema.shape.phones.element.safeParse(p)
        if (!parsed.success) {
          dropped.push(`${p.brand}/${p.name}`)
          continue
        }
        const slug = parsed.data.slug ?? phoneSlug(parsed.data.brand, parsed.data.name)
        if (seen.has(slug)) continue
        seen.add(slug)
        phones.push(p)
      }
    } catch (e) {
      failed.push({ brand, error: e instanceof Error ? e.message : String(e) })
      ctx.log({ brand, err: String(e) }, 'phone adapter failed')
    }
  }
  return { phones, failed, dropped }
}
