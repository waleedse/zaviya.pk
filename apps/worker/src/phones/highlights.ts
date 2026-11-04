import type { PhoneSpecs } from '@zaviya/shared'

/**
 * Spec facts stated in a manufacturer's own page title / meta description / spec text
 * ("5000mAh Massive Battery, 90Hz display, 50MP camera"). Only numbers that are written there are returned;
 * a field we cannot read stays out (the site then shows "-", never a guess).
 */
export function extractHighlights(text: string): PhoneSpecs {
  const t = text.replace(/&quot;|&#34;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ')
  const specs: PhoneSpecs = {}

  const battery = /(\d[\d,]{3,5})\s*mAh/i.exec(t)
  if (battery) {
    const n = Number(battery[1]!.replace(/,/g, ''))
    if (n >= 1500 && n <= 12000) specs.batteryMah = n
  }
  const charge = /(\d{2,3})\s*W\b[^.]{0,30}?(?:charg|flash|supervooc|fast)|(?:charg|flash|supervooc|fast)[^.]{0,30}?(\d{2,3})\s*W\b/i.exec(t)
  if (charge) {
    const n = Number(charge[1] ?? charge[2])
    if (n >= 10 && n <= 240) specs.chargingW = n
  }
  const hz = /(\d{2,3})\s*Hz/i.exec(t)
  if (hz) {
    const n = Number(hz[1])
    if (n >= 60 && n <= 240) specs.refreshRateHz = n
  }
  const size = /(\d\.\d{1,2})\s*(?:"|”|-?inch(?:es)?)/i.exec(t)
  if (size) specs.displaySize = `${size[1]} inches`
  const panel = /\b(Super AMOLED|Dynamic AMOLED(?: 2X)?|LTPO AMOLED|AMOLED|OLED|IPS LCD|LCD|IPS)\b/i.exec(t)
  if (panel) specs.displayType = panel[1]!.replace(/\bamoled\b/i, 'AMOLED')
  const cam = /(\d{2,3})\s*MP\b/i.exec(t)
  if (cam) specs.rearCamera = `${cam[1]}MP main`
  return specs
}

/** "6GB+128GB" / "8GB + 256GB" / "12GB+512GB" -> {ramGb, storageGb} */
export function parseMemory(text: string): { ramGb: number; storageGb: number } | null {
  const m = /(\d{1,2})\s*GB\s*\+\s*(\d{2,4})\s*(GB|TB)/i.exec(text)
  if (!m) return null
  return { ramGb: Number(m[1]), storageGb: m[3]!.toUpperCase() === 'TB' ? Number(m[2]) * 1024 : Number(m[2]) }
}

/** "Rs. 82,999" / "Rs.20,999" / "₨. 458,999.00" -> 82999 (null when it is not a plausible phone price) */
export function parsePkr(text: string): number | null {
  const m = /(?:Rs\.?|PKR|₨\.?)\s*([\d,]{4,9})(?:\.\d+)?/i.exec(text)
  if (!m) return null
  const n = Number(m[1]!.replace(/,/g, ''))
  return n >= 3000 && n <= 1_500_000 ? n : null
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
}

export function metaContent(html: string, name: string): string | undefined {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`, 'i')
  const m = re.exec(html)
  const v = m?.[1] ?? m?.[2]
  return v ? decodeEntities(v) : undefined
}

export function pageTitle(html: string): string | undefined {
  const m = /<title[^>]*>([^<]*)<\/title>/i.exec(html)
  return m ? decodeEntities(m[1]!.trim()) : undefined
}
