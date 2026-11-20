import { decodeEntities } from '../phones/highlights.js'
import { modelFrom } from '../appliances/collect.js'
import { politeText } from './http.js'
import type { Listing } from './parsers.js'

/**
 * Shops without a JSON feed (docs/PRODUCT-SEARCH.md section 7): product URLs come from the shop's sitemap, each product page is read for its
 * schema.org Product / Offer data (JSON-LD) or og:price / product:price meta tags. Only PKR prices count. If the plain HTML is an empty JavaScript
 * shell, one page at a time is rendered in the worker's Chromium (Zaviya user agent, robots.txt honoured, no stealth).
 */

const PRODUCT_PATH = /\/(product|products|item|shop|p|buy)\/[^/]+/i
const sitemapCache = new Map<string, { at: number; urls: string[] }>()

const locs = (xml: string) => [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)\s*(?:\]\]>)?\s*<\/loc>/gi)].map((m) => decodeEntities(m[1]!))

/** Product page URLs of a shop from robots.txt / sitemap.xml (index files followed, at most 6 child sitemaps, 40,000 URLs) */
export async function sitemapProductUrls(base: string): Promise<string[]> {
  const hit = sitemapCache.get(base)
  if (hit && Date.now() - hit.at < 6 * 3_600_000) return hit.urls
  const roots: string[] = []
  const robots = await politeText(`${base}/robots.txt`)
  if (robots.ok) for (const m of robots.text.matchAll(/^sitemap:\s*(\S+)/gim)) roots.push(m[1]!)
  if (!roots.length) roots.push(`${base}/sitemap.xml`)
  const urls: string[] = []
  const queue = roots.slice(0, 4)
  let fetched = 0
  while (queue.length && fetched < 8 && urls.length < 40_000) {
    const r = await politeText(queue.shift()!, { timeoutMs: 30_000 })
    fetched++
    if (!r.ok) continue
    const found = locs(r.text)
    if (/<sitemapindex/i.test(r.text)) {
      // product sitemaps first
      queue.push(...found.sort((a, b) => Number(/product/i.test(b)) - Number(/product/i.test(a))).slice(0, 6))
    } else urls.push(...found.filter((u) => PRODUCT_PATH.test(new URL(u).pathname) && !/\.(jpe?g|png|webp|gif)$/i.test(u)))
  }
  const uniq = [...new Set(urls)].slice(0, 40_000)
  sitemapCache.set(base, { at: Date.now(), urls: uniq })
  return uniq
}

const flat = (v: unknown): Record<string, any>[] => {
  if (Array.isArray(v)) return v.flatMap(flat)
  if (v && typeof v === 'object') {
    const o = v as Record<string, any>
    return [o, ...flat(o['@graph'])]
  }
  return []
}
const isType = (o: Record<string, any>, t: string) => [o['@type']].flat().some((x) => String(x).toLowerCase() === t.toLowerCase())
const num = (v: unknown) => {
  const n = Number(String(v ?? '').replace(/[, ]/g, ''))
  return Number.isFinite(n) && n >= 10 && n <= 50_000_000 ? Math.round(n) : null
}
const str = (v: any, max: number) => decodeEntities(String(Array.isArray(v) ? (v[0]?.name ?? v[0]) : (v?.name ?? v ?? ''))).replace(/\s+/g, ' ').trim().slice(0, max)

/** A Listing from the product page HTML, or null when it has no PKR price */
export function parseProductHtml(html: string, url: string): Listing | null {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]!)
  for (const b of blocks) {
    let data: unknown
    try {
      data = JSON.parse(b.trim())
    } catch {
      continue
    }
    for (const o of flat(data)) {
      if (!isType(o, 'Product')) continue
      const offers = flat(o.offers)
      const offer = offers.find((x) => num(x.price ?? x.lowPrice) != null) ?? offers[0]
      if (!offer) continue
      const cur = String(offer.priceCurrency ?? '').toUpperCase()
      const price = num(offer.price ?? offer.lowPrice ?? offer.priceSpecification?.price)
      if (cur !== 'PKR' || price == null) continue
      const title = str(o.name, 200)
      if (title.length < 2) continue
      const img = Array.isArray(o.image) ? o.image[0] : o.image
      const gtin = String(o.gtin13 ?? o.gtin ?? o.gtin14 ?? o.gtin12 ?? o.gtin8 ?? '')
      return {
        handle: new URL(url).pathname.replace(/^\/|\/$/g, '').replace(/\//g, '-').slice(0, 200) || 'item',
        title,
        brand: str(o.brand, 60) || undefined,
        productType: str(o.category, 120) || undefined,
        url,
        imageUrl: typeof img === 'string' ? img : typeof img?.url === 'string' ? img.url : undefined,
        pricePkr: price,
        listPricePkr: null,
        inStock: !/OutOfStock|SoldOut|Discontinued/i.test(String(offer.availability ?? '')),
        model: modelFrom(title),
        gtin: /^\d{8,14}$/.test(gtin) ? gtin : undefined,
      }
    }
  }
  // og / product meta tags (many Woo and custom shops)
  const meta = (name: string) => new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i').exec(html)?.[1] ?? new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["']`, 'i').exec(html)?.[1]
  const cur = (meta('product:price:currency') ?? meta('og:price:currency') ?? '').toUpperCase()
  const price = num(meta('product:price:amount') ?? meta('og:price:amount'))
  const title = str(meta('og:title'), 200)
  if (cur === 'PKR' && price != null && title.length >= 2) {
    return { handle: new URL(url).pathname.replace(/^\/|\/$/g, '').replace(/\//g, '-').slice(0, 200) || 'item', title, url, imageUrl: meta('og:image'), pricePkr: price, listPricePkr: null, inStock: true, model: modelFrom(title) }
  }
  return null
}

const looksLikeShell = (html: string) => html.length < 20_000 && /id=["'](root|app|__next)["']|__NEXT_DATA__|window\.__NUXT__/i.test(html)

let browserP: Promise<import('puppeteer-core').Browser> | null = null
let idle: NodeJS.Timeout | null = null
async function renderHtml(url: string): Promise<string | null> {
  const exe = process.env.CHROMIUM_PATH
  if (!exe) return null
  try {
    browserP ??= import('puppeteer-core').then(({ default: p }) => p.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] }))
    const b = await browserP
    const page = await b.newPage()
    try {
      // honest agent: Chromium's own string plus our name, never a person's
      await page.setUserAgent('ZaviyaBot/1.0 (+https://zaviya.pk/bot)')
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 25_000 })
      return await page.content()
    } finally {
      await page.close().catch(() => {})
    }
  } catch {
    return null
  } finally {
    // free the ~300 MB when nothing needs it for 2 minutes
    if (idle) clearTimeout(idle)
    idle = setTimeout(() => {
      const p = browserP
      browserP = null
      void p?.then((b) => b.close()).catch(() => {})
    }, 120_000)
  }
}

/** One product page -> Listing; Chromium only for an empty JavaScript shell */
export async function readProductPage(url: string): Promise<{ listing: Listing | null; error?: string }> {
  const r = await politeText(url)
  if (!r.ok) return { listing: null, error: r.error }
  let listing = parseProductHtml(r.text, url)
  if (!listing && looksLikeShell(r.text)) {
    const html = await renderHtml(url)
    if (html) listing = parseProductHtml(html, url)
  }
  return { listing }
}

/** Probe: do 3 sampled product pages of this shop give a PKR Product? */
export async function probeJsonLd(base: string): Promise<boolean> {
  const urls = await sitemapProductUrls(base)
  if (!urls.length) return false
  const sample = [urls[0]!, urls[Math.floor(urls.length / 2)]!, urls[urls.length - 1]!]
  for (const u of [...new Set(sample)]) if ((await readProductPage(u)).listing) return true
  return false
}
