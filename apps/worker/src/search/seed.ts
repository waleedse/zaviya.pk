import { OFFER_GROUPS } from '@zaviya/shared'
import { ZAVIYA_USER_AGENT } from '../ingest/extract.js'
import { logger } from '../logger.js'

/**
 * Candidate shops, found automatically (docs/PRODUCT-SEARCH.md section 11). Two lawful sources, both throttled:
 *  - Common Crawl's public URL index: pages under /products/ or /product/ on .pk domains (the crawl is public data, not a comparison site)
 *  - Google's official Custom Search JSON API (GOOGLE_CSE_KEY + GOOGLE_CSE_CX, 100 free queries a day): category queries such as
 *    "buy perfume online Pakistan"; we keep only the domains of the results, then probe each one. Result pages are never scraped.
 */
type Request = <T>(method: string, path: string, body?: unknown, opts?: { timeoutMs?: number; retries?: number }) => Promise<T>
interface Kv {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<unknown>
}

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.toLowerCase()
  } catch {
    return null
  }
}

const CC_PATTERNS = ['*.pk/products/*', '*.pk/product/*', '*.pk/shop/*']

export async function seedFromCommonCrawl(deps: { request: Request; kv: Kv }) {
  const cursor = JSON.parse((await deps.kv.get('zaviya:search:cc')) ?? '{"p":0,"page":0,"crawl":""}') as { p: number; page: number; crawl: string }
  try {
    if (!cursor.crawl) {
      const info = (await (await fetch('https://index.commoncrawl.org/collinfo.json', { signal: AbortSignal.timeout(20_000) })).json()) as { id: string }[]
      cursor.crawl = info[0]!.id
    }
    const url = `https://index.commoncrawl.org/${cursor.crawl}-index?url=${encodeURIComponent(CC_PATTERNS[cursor.p]!)}&output=json&fl=url&page=${cursor.page}`
    const res = await fetch(url, { headers: { 'User-Agent': ZAVIYA_USER_AGENT }, signal: AbortSignal.timeout(90_000) })
    const text = res.ok ? await res.text() : ''
    const hosts = new Set<string>()
    for (const line of text.split('\n')) {
      const m = /"url":\s*"([^"]+)"/.exec(line)
      const h = m ? hostOf(m[1]!) : null
      if (h) hosts.add(h)
    }
    if (hosts.size) await deps.request('POST', '/api/pipeline/search/hosts', { hosts: [...hosts].slice(0, 2000).map((host) => ({ host, source: 'commoncrawl' })) }, { timeoutMs: 60_000 })
    // empty page or error -> next pattern; after the last pattern start again (the next crawl brings new domains)
    if (!hosts.size) {
      cursor.p = (cursor.p + 1) % CC_PATTERNS.length
      cursor.page = 0
    } else cursor.page++
    await deps.kv.set('zaviya:search:cc', JSON.stringify(cursor))
    logger.info({ hosts: hosts.size, cursor }, 'search seed: common crawl')
    return hosts.size
  } catch (e) {
    logger.warn({ err: String(e) }, 'search seed: common crawl failed')
    return 0
  }
}

export async function seedFromSearchApi(deps: { request: Request; kv: Kv }) {
  const key = process.env.GOOGLE_CSE_KEY
  const cx = process.env.GOOGLE_CSE_CX
  if (!key || !cx) return 0
  const day = new Date().toISOString().slice(0, 10)
  const used = JSON.parse((await deps.kv.get('zaviya:search:cse')) ?? '{}') as { day?: string; n?: number }
  const n = used.day === day ? (used.n ?? 0) : 0
  if (n >= 90) return 0 // stay inside the free 100 queries a day
  const w = await deps.request<{ labels: string[] }>('GET', '/api/pipeline/search/work?labels=10', undefined, { timeoutMs: 30_000 })
  const terms = [...OFFER_GROUPS.map((g) => g.name.toLowerCase()), ...w.labels]
  const term = terms[Math.floor(Math.random() * terms.length)]!
  try {
    const q = encodeURIComponent(`buy ${term} online Pakistan price`)
    const res = await fetch(`https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&q=${q}&gl=pk&num=10`, { signal: AbortSignal.timeout(20_000) })
    await deps.kv.set('zaviya:search:cse', JSON.stringify({ day, n: n + 1 }))
    if (!res.ok) return 0
    const data = (await res.json()) as { items?: { link: string }[] }
    const hosts = [...new Set((data.items ?? []).map((i) => hostOf(i.link)).filter((h): h is string => Boolean(h)))]
    if (hosts.length) await deps.request('POST', '/api/pipeline/search/hosts', { hosts: hosts.map((host) => ({ host, source: 'search' })) }, { timeoutMs: 30_000 })
    logger.info({ term, hosts: hosts.length }, 'search seed: search api')
    return hosts.length
  } catch {
    return 0
  }
}
