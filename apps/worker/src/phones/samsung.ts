import { slugify, type PhoneImportInput, type PhoneSpecs } from '@zaviya/shared'
import { decodeEntities, extractHighlights, metaContent } from './highlights.js'
import type { AdapterCtx } from './types.js'

/**
 * Samsung Pakistan (samsung.com/pk): every phone has one page per colour and storage ("product detail page").
 * The sitemap lists them; each page carries a schema.org Product with the official PKR price.
 */

const SITEMAP = 'https://www.samsung.com/pk/im-sitemap.xml'
const PDP = /^https:\/\/www\.samsung\.com\/pk\/smartphones\/[a-z0-9-]+\/[a-z0-9-]+-(\d+)(gb|tb)-(sm-[a-z0-9]+)\/$/

export interface SamsungPdpUrl {
  url: string
  storageGb: number
  /** SM-A176B: model code without colour and market suffix, one phone family */
  model: string
  /** slug text before the storage: "galaxy-a17-5g-black" */
  stem: string
}

export function parseSitemapUrls(xml: string): SamsungPdpUrl[] {
  const out: SamsungPdpUrl[] = []
  for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const url = m[1]!.trim()
    const p = PDP.exec(url)
    if (!p) continue
    const storage = Number(p[1]) * (p[2] === 'tb' ? 1024 : 1)
    const code = p[3]!
    const stem = url.split('/').filter(Boolean).pop()!.replace(new RegExp(`-${p[1]}${p[2]}-${code}$`), '')
    out.push({ url, storageGb: storage, model: code.slice(0, 8), stem })
  }
  return out
}

export interface SamsungPdp {
  name: string
  pricePkr: number | null
  image?: string
  description?: string
  specs: PhoneSpecs
}

const num = (s: string) => Number(s.replace(/,/g, ''))

/** "Galaxy A17 5G. ... Camera: Ultra Wide Camera 5 MP, Wide Camera 50 MP with OIS, ... Front Camera 13 MP. Battery: 5,000 mAh. AP: Exynos 1330. Weight & Size: Weight 192 g, Dimension (HxWxD) 164.4 x 77.9 x 7.5. Display: Main Display Dimension 6.7 inches." */
export function parseSamsungSpecAlt(html: string, name: string): PhoneSpecs {
  const specs: PhoneSpecs = {}
  const re = /data-desktop-alt="([^"]*)"/g
  let alt: string | undefined
  for (const m of html.matchAll(re)) {
    const v = decodeEntities(m[1]!)
    if (v.startsWith(`${name}.`) && /Battery:/.test(v)) {
      alt = v
      break
    }
  }
  if (!alt) return specs
  // only this phone's part: the compare text continues with the next phone's name
  const rest = alt.slice(name.length + 1)
  const own = rest.split(/\.(?=Galaxy )/)[0]!
  const batt = /Battery:\s*([\d,]+)\s*mAh/i.exec(own)
  if (batt) specs.batteryMah = num(batt[1]!)
  const ap = /AP:\s*([^.]+?)(?:\.|$)/.exec(own)
  if (ap) specs.chipset = ap[1]!.split(',')[0]!.trim()
  const weight = /Weight\s+([\d.]+)\s*g/i.exec(own)
  if (weight) specs.weightG = Number(weight[1])
  const dim = /Dimension \(HxWxD\)\s*([\d.]+ x [\d.]+ x \d+(?:\.\d+)?)/i.exec(own)
  if (dim) specs.dimensions = `${dim[1]!.replace(/\.$/, '')} mm`
  const disp = /Main Display Dimension\s*([\d.]+)\s*inches/i.exec(own)
  if (disp) specs.displaySize = `${disp[1]} inches`
  const cam = /Camera:\s*([^.]*?)(?:\.\s|\.$|$)/.exec(own)
  if (cam) {
    const part = (label: RegExp) => label.exec(cam[1]!)?.[1]
    const wide = part(/(?<!Ultra )Wide Camera\s*(\d+)\s*MP/i)
    const ultra = part(/Ultra Wide Camera\s*(\d+)\s*MP/i)
    const macro = part(/Macro Camera\s*(\d+)\s*MP/i)
    const tele = part(/Telephoto Camera\s*(\d+)\s*MP/i)
    const front = part(/Front Camera\s*(\d+)\s*MP/i)
    const rear = [wide && `${wide}MP wide`, ultra && `${ultra}MP ultra-wide`, tele && `${tele}MP telephoto`, macro && `${macro}MP macro`].filter(Boolean).join(' + ')
    if (rear) specs.rearCamera = rear
    if (front) specs.frontCamera = `${front}MP`
  }
  return specs
}

export function parseSamsungPdp(html: string): SamsungPdp | null {
  const ld = /"@type":"Product"[\s\S]*?"name":"([^"]+)"/.exec(html)
  const name = ld ? decodeEntities(ld[1]!.trim()) : undefined
  if (!name) return null
  // the Product offer carries the price; the page also has other "price" keys (cross-sell), so read the one inside the Product block
  const block = /"@type":"Product"[\s\S]*?"offers":\{[^}]*\}/.exec(html)?.[0] ?? ''
  const price = /"price":"?(\d{4,7})"?/.exec(block)?.[1]
  const image = /"@type":"Product"[\s\S]*?"image":"([^"]+)"/.exec(html)?.[1]
  const description = metaContent(html, 'description') ?? /"@type":"Product"[\s\S]*?"description":"((?:[^"\\]|\\.)*)"/.exec(html)?.[1]
  const specs: PhoneSpecs = { ...extractHighlights(description ?? ''), ...parseSamsungSpecAlt(html, name) }
  return { name, pricePkr: price ? Number(price) : null, image, description, specs }
}

const titleCase = (s: string) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase())

/** colour words of a page slug: stem minus the phone name */
export function colourFromStem(stem: string, name: string): string | null {
  const nameSlug = slugify(name)
  if (!stem.startsWith(`${nameSlug}-`)) return null
  const c = stem.slice(nameSlug.length + 1)
  return c ? titleCase(c.replace(/-/g, ' ')) : null
}

export async function fetchSamsung(ctx: AdapterCtx): Promise<PhoneImportInput[]> {
  const xml = await ctx.fetchText(SITEMAP)
  if (!xml) throw new Error('samsung sitemap unavailable')
  const urls = parseSitemapUrls(xml)
  // one page per phone family and storage is enough for the price: colours do not change it
  const groups = new Map<string, SamsungPdpUrl[]>()
  for (const u of urls) {
    const k = `${u.model}-${u.storageGb}`
    groups.set(k, [...(groups.get(k) ?? []), u])
  }
  interface Family {
    name: string
    image?: string
    specs: PhoneSpecs
    urls: SamsungPdpUrl[]
    variants: Map<number, { price: number; url: string }>
    officialUrl: string
  }
  const families = new Map<string, Family>()
  await ctx.mapLimit([...groups.values()], async (group) => {
    const first = group[0]!
    const html = await ctx.fetchText(first.url)
    if (!html) return
    const pdp = parseSamsungPdp(html)
    // no price on the page: not on sale in Pakistan (or not announced): skip, never guess
    if (!pdp || !pdp.pricePkr) return
    const key = `${first.model}:${pdp.name}`
    const fam: Family = families.get(key) ?? { name: pdp.name, image: pdp.image, specs: {}, urls: [], variants: new Map(), officialUrl: first.url }
    fam.urls.push(...group)
    fam.specs = { ...pdp.specs, ...fam.specs }
    fam.image ??= pdp.image
    fam.variants.set(first.storageGb, { price: pdp.pricePkr, url: first.url })
    families.set(key, fam)
  })
  const out: PhoneImportInput[] = []
  const list = [...families.values()].sort((a, b) => a.name.localeCompare(b.name))
  list.forEach((fam, i) => {
    const colours = [...new Set(fam.urls.map((u) => colourFromStem(u.stem, fam.name)).filter((c): c is string => !!c))]
    out.push({
      brand: 'samsung',
      name: fam.name,
      imageUrl: fam.image,
      officialUrl: fam.officialUrl,
      specsSourceUrl: fam.officialUrl,
      colours: colours.slice(0, 12),
      specs: fam.specs,
      variants: [...fam.variants.entries()].map(([storageGb, v]) => ({ storageGb, pricePkr: v.price, priceSourceUrl: v.url })),
      // newest families sort last by name; popularity here is only a first ordering, editors can change it in the admin
      popularity: Math.max(20, 70 - Math.floor((i * 40) / Math.max(1, list.length))),
    })
  })
  return out
}
