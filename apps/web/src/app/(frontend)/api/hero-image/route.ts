import type { NextRequest } from 'next/server'
import sharp from 'sharp'
import { HERO_UPSCALE_WIDTH, isMediaSrc } from '@/lib/hero-image'
import { absoluteUrl } from '@/lib/seo'

export const runtime = 'nodejs'

/** A stored photo narrower than 1200 px, enlarged to 1280 px wide JPEG so og:image and the hero meet Google Discover's size rule. */
export async function GET(req: NextRequest) {
  const src = req.nextUrl.searchParams.get('src') ?? ''
  if (!isMediaSrc(src)) return new Response('src must be a Zaviya media file', { status: 400 })
  const upstream = await fetch(absoluteUrl(src), { signal: AbortSignal.timeout(15_000) }).catch(() => null)
  if (!upstream?.ok) return new Response('image not found', { status: 404 })
  try {
    const body = await sharp(Buffer.from(await upstream.arrayBuffer()))
      .resize({ width: HERO_UPSCALE_WIDTH, kernel: 'lanczos3' })
      .jpeg({ quality: 85 })
      .toBuffer()
    return new Response(new Uint8Array(body), {
      headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400, s-maxage=604800, immutable' },
    })
  } catch {
    return new Response('not an image', { status: 415 })
  }
}
