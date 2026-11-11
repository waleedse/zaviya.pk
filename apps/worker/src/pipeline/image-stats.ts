import jpeg from 'jpeg-js'
import { PNG } from 'pngjs'

/**
 * Cheap pixel statistics used to spot document and screenshot images (a scanned letter, a press-release page, a web page
 * capture): mostly white or with only a handful of flat colours, unlike a photo. Decoding is pure JS, no native deps.
 */
export interface ImageStats {
  width: number
  height: number
  /** Share of near-white, near-grey pixels (paper) */
  whiteFrac: number
  /** Mean saturation 0..1 */
  satMean: number
  /** How many 4-bit colour bins hold 90 % of the pixels: a photo needs dozens, a page or UI screenshot a handful */
  bins90: number
}

const MAX_SAMPLES = 120_000

export function analyzeImage(bytes: Buffer, mime = ''): ImageStats | null {
  try {
    let width = 0
    let height = 0
    let data: Uint8Array
    const isPng = /png/i.test(mime) || (bytes[0] === 0x89 && bytes[1] === 0x50)
    if (isPng) {
      const png = PNG.sync.read(bytes)
      width = png.width
      height = png.height
      data = png.data
    } else {
      const img = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 400 })
      width = img.width
      height = img.height
      data = img.data
    }
    if (!width || !height) return null
    const total = width * height
    const stride = Math.max(1, Math.floor(total / MAX_SAMPLES))
    const bins = new Map<number, number>()
    let n = 0
    let white = 0
    let sat = 0
    for (let p = 0; p < total; p += stride) {
      const i = p * 4
      const a = data[i + 3] ?? 255
      // Transparent pixels show as white on the page
      const r = a < 128 ? 255 : (data[i] ?? 0)
      const g = a < 128 ? 255 : (data[i + 1] ?? 0)
      const b = a < 128 ? 255 : (data[i + 2] ?? 0)
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      if (min >= 225 && max - min <= 25) white++
      sat += max === 0 ? 0 : (max - min) / max
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
      bins.set(key, (bins.get(key) ?? 0) + 1)
      n++
    }
    if (!n) return null
    const sorted = [...bins.values()].sort((x, y) => y - x)
    let acc = 0
    let bins90 = 0
    for (const c of sorted) {
      acc += c
      bins90++
      if (acc >= n * 0.9) break
    }
    return { width, height, whiteFrac: white / n, satMean: sat / n, bins90 }
  } catch {
    return null
  }
}

/** Why these stats say "document, not photo", or null when it looks like a photo. */
export function documentReason(s: ImageStats): string | null {
  if (s.whiteFrac >= 0.7) return `mostly white (${Math.round(s.whiteFrac * 100)}%), looks like a page`
  if (s.whiteFrac >= 0.5 && s.satMean < 0.12) return `white page with grey text (${Math.round(s.whiteFrac * 100)}% white)`
  if (s.bins90 <= 14) return `only ${s.bins90} flat colours, looks like a screenshot`
  return null
}
