import type { ImageRef } from '@zaviya/shared'

/** Google Discover wants a large image, at least 1200 px wide. */
export const DISCOVER_MIN_WIDTH = 1200
/** Width of the enlarged copy served for photos that were stored narrower than DISCOVER_MIN_WIDTH. */
export const HERO_UPSCALE_WIDTH = 1280

const MEDIA_PREFIX = '/api/media/file/'

export function heroImageRoute(src: string): string {
  return `/api/hero-image?src=${encodeURIComponent(src)}`
}

/**
 * The picture to put in og:image, the NewsArticle schema and the page hero. Photos stored 1200 px wide or more are
 * used as they are; narrower ones (the image model makes 1024 px) are served through /api/hero-image, an enlarged
 * 1280 px copy. Other images (external) are returned unchanged.
 */
export function discoverImage(img: Pick<ImageRef, 'url' | 'width' | 'height'> | undefined): { url: string; width: number; height: number; enlarged: boolean } | undefined {
  if (!img?.url) return undefined
  const { url, width, height } = img
  if (!(width > 0) || width >= DISCOVER_MIN_WIDTH || !url.startsWith(MEDIA_PREFIX)) return { url, width, height, enlarged: false }
  return { url: heroImageRoute(url), width: HERO_UPSCALE_WIDTH, height: Math.round((HERO_UPSCALE_WIDTH * height) / width), enlarged: true }
}

/** Only our own media may go through the enlarging route (it must not become an open image proxy). */
export function isMediaSrc(src: string): boolean {
  return src.startsWith(MEDIA_PREFIX) && !src.includes('..') && /^[A-Za-z0-9._%/-]+$/.test(src.slice(MEDIA_PREFIX.length)) && src.length < 300
}
