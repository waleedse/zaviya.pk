import { staticFile } from 'remotion'

/** Fixture images are file names under public/fixtures-images/; absolute URLs pass through. */
export function resolveImage(src: string): string {
  return /^(https?:|data:|\/)/.test(src) ? src : staticFile(`fixtures-images/${src}`)
}

/** Black or white, whichever reads better on the given hex colour. */
export function inkOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return '#FFFFFF'
  const n = parseInt(m[1]!, 16)
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
  // contrast with white vs black
  return 1.05 / (L + 0.05) >= (L + 0.05) / 0.05 ? '#FFFFFF' : '#0A0A0A'
}
