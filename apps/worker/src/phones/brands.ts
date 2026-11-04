import type { PhoneImportInput, PhoneSpecs, PhoneVariantInput } from '@zaviya/shared'
import { decodeEntities, extractHighlights, metaContent, pageTitle, parseMemory, parsePkr } from './highlights.js'
import type { AdapterCtx } from './types.js'

/**
 * Official Pakistan sites of Vivo, Realme, Oppo and Xiaomi/Redmi.
 * Vivo and Realme publish PKR prices on their sites; Oppo and Xiaomi publish none, so their phones are listed
 * without a price ("price not announced") until an official one appears.
 * Specs are only what the brand's own page title and description state (battery, charging, refresh rate, camera).
 */

export function stripBrand(name: string, brand: string): string {
  const n = name.replace(new RegExp(`^${brand}\\s+`, 'i'), '').trim()
  return n || name
}

/** Newest first in the brands' own lists: earlier = more prominent. Only a starting order; editors can change popularity in the admin. */
export const rankPopularity = (i: number, total: number) => Math.max(20, 80 - Math.floor((i * 50) / Math.max(1, total)))

// ---------- Vivo ----------

const VIVO_LIST = 'https://www.vivo.com/pk/products'
const VIVO_PHONE_NAME = /^(?:iQOO\s)?[XVYTS]\d/i

export interface VivoListItem {
  name: string
  url: string
  image?: string
  variants: PhoneVariantInput[]
}

export function parseVivoList(html: string): VivoListItem[] {
  const out: VivoListItem[] = []
  for (const m of html.matchAll(/<li class="product-item">([\s\S]*?)<\/li>\s*(?=<li class="product-item">|<\/ul>)/g)) {
    const block = m[1]!
    const a = /<a class="product-item-link" href="([^"]+)"[^>]*data-name="([^"]*)"[^>]*data-price="([^"]*)"/.exec(block)
    if (!a) continue
    const name = decodeEntities(a[2]!).trim()
    if (!VIVO_PHONE_NAME.test(name)) continue
    const url = new URL(a[1]!, 'https://www.vivo.com').toString()
    const image = /<img[^>]+src="(https:[^"]+\.(?:png|jpg|webp))"/.exec(block)?.[1]
    const variants: PhoneVariantInput[] = []
    for (const line of a[3]!.split(/<br\s*\/?>/i)) {
      const mem = parseMemory(line)
      const price = parsePkr(line)
      if (mem && price) variants.push({ ramGb: mem.ramGb, storageGb: mem.storageGb, pricePkr: price, priceSourceUrl: VIVO_LIST })
    }
    out.push({ name, url, image, variants })
  }
  return out
}

export async function fetchVivo(ctx: AdapterCtx): Promise<PhoneImportInput[]> {
  const html = await ctx.fetchText(VIVO_LIST)
  if (!html) throw new Error('vivo list unavailable')
  const items = parseVivoList(html)
  const out: PhoneImportInput[] = []
  await ctx.mapLimit(items, async (it) => {
    const page = await ctx.fetchText(it.url)
    const specs: PhoneSpecs = page ? extractHighlights(`${pageTitle(page) ?? ''}. ${metaContent(page, 'description') ?? ''}`) : {}
    out.push({ brand: 'vivo', name: stripBrand(it.name, 'vivo'), imageUrl: it.image, officialUrl: it.url, specsSourceUrl: it.url, specs, variants: it.variants })
  })
  return out.map((p, i) => ({ ...p, popularity: rankPopularity(i, out.length) }))
}

// ---------- Realme ----------

const REALME_HOME = 'https://www.realme.com/pk/'
const REALME_PHONE = /^realme\s+(?:\d|C\d|Note|GT|Narzo|P\d|Neo)/i

export interface RealmeNavItem {
  name: string
  url: string
  image?: string
  pricePkr: number | null
}

export function parseRealmeNav(html: string): RealmeNavItem[] {
  const seen = new Set<string>()
  const out: RealmeNavItem[] = []
  for (const m of html.matchAll(/<li><a href="(https:\/\/www\.realme\.com\/pk\/[a-z0-9-]+)"[^>]*title="([^"]+)"[\s\S]*?<\/a><\/li>/g)) {
    const url = m[1]!
    const name = decodeEntities(m[2]!).trim()
    if (seen.has(url) || !REALME_PHONE.test(name)) continue
    seen.add(url)
    const block = m[0]
    const image = /data-src="(https:[^"]+\.(?:png|webp|jpg))"/.exec(block)?.[1]
    const priceBlock = /<p class="nav-submenu-price">([\s\S]*?)<\/p>/.exec(block)?.[1] ?? ''
    out.push({ name, url, image, pricePkr: parsePkr(priceBlock) })
  }
  return out
}

export async function fetchRealme(ctx: AdapterCtx): Promise<PhoneImportInput[]> {
  const html = await ctx.fetchText(REALME_HOME)
  if (!html) throw new Error('realme home unavailable')
  const items = parseRealmeNav(html)
  const out: PhoneImportInput[] = []
  await ctx.mapLimit(items, async (it) => {
    const page = await ctx.fetchText(it.url)
    const specs: PhoneSpecs = page ? extractHighlights(`${pageTitle(page) ?? ''}. ${metaContent(page, 'description') ?? ''}`) : {}
    out.push({
      brand: 'realme',
      name: stripBrand(it.name, 'realme'),
      imageUrl: it.image,
      officialUrl: it.url,
      specsSourceUrl: it.url,
      specs,
      // the nav shows one starting price, without the memory option it belongs to
      variants: it.pricePkr ? [{ storageGb: 0, pricePkr: it.pricePkr, priceSourceUrl: REALME_HOME }] : [],
    })
  })
  return out.map((p, i) => ({ ...p, popularity: rankPopularity(i, out.length) }))
}

// ---------- Oppo (no prices on oppo.com/pk) ----------

const OPPO_LIST = 'https://www.oppo.com/pk/smartphones/'
const OPPO_MAX = 20

export function parseOppoLinks(html: string): string[] {
  const links = [...new Set((html.match(/\/pk\/smartphones\/series-(?:reno|a|find|k)\/[a-z0-9-]+\//g) ?? []).filter((l) => !l.endsWith('/specs/')))]
  return links.slice(0, OPPO_MAX).map((l) => `https://www.oppo.com${l}`)
}

export async function fetchOppo(ctx: AdapterCtx): Promise<PhoneImportInput[]> {
  const html = await ctx.fetchText(OPPO_LIST)
  if (!html) throw new Error('oppo list unavailable')
  const out: PhoneImportInput[] = []
  await ctx.mapLimit(parseOppoLinks(html), async (url) => {
    const page = await ctx.fetchText(url)
    if (!page) return
    const title = /^(?:OPPO\s+)?(.+?)\s+(?:-|\|)/.exec(pageTitle(page) ?? '')?.[1]
    if (!title) return
    const image = metaContent(page, 'og:image')
    out.push({
      brand: 'oppo',
      name: stripBrand(title, 'oppo'),
      imageUrl: image,
      officialUrl: url,
      specsSourceUrl: url,
      specs: extractHighlights(`${pageTitle(page) ?? ''}. ${metaContent(page, 'description') ?? ''}`),
      variants: [],
    })
  })
  return out.map((p, i) => ({ ...p, popularity: rankPopularity(i, out.length) }))
}

// ---------- Xiaomi / Redmi / Poco (no prices on mi.com/pk) ----------

const MI_LIST = 'https://www.mi.com/pk/mobile'
const MI_MAX = 18

export function parseXiaomiLinks(html: string): string[] {
  const links = [...new Set(html.match(/\/pk\/product\/[a-z0-9-]+/g) ?? [])].filter((l) => !/-pad-|-watch|-band|-buds|-tv|-tab/.test(l))
  return links.slice(0, MI_MAX).map((l) => `https://www.mi.com${l}`)
}

export async function fetchXiaomi(ctx: AdapterCtx): Promise<PhoneImportInput[]> {
  const html = await ctx.fetchText(MI_LIST)
  if (!html) throw new Error('xiaomi list unavailable')
  const out: PhoneImportInput[] = []
  await ctx.mapLimit(parseXiaomiLinks(html), async (url) => {
    const page = await ctx.fetchText(url)
    if (!page) return
    const name = /of\s+(.+?)\s*\|/.exec(pageTitle(page) ?? '')?.[1]
    if (!name) return
    const brand = /^redmi\b/i.test(name) ? 'redmi' : 'xiaomi'
    out.push({
      brand,
      name: brand === 'redmi' ? stripBrand(name, 'redmi') : stripBrand(name, 'xiaomi'),
      officialUrl: url,
      specsSourceUrl: url,
      specs: extractHighlights(metaContent(page, 'description') ?? ''),
      variants: [],
    })
  })
  return out.map((p, i) => ({ ...p, popularity: rankPopularity(i, out.length) }))
}
