import type { NextRequest } from 'next/server'
import sharp from 'sharp'
import { absoluteUrl, siteUrl } from '@/lib/seo'
import { STORY_POSTER_HEIGHT, STORY_POSTER_WIDTH } from '@/lib/web-story'

export const runtime = 'nodejs'

/** A 3:4 portrait poster for Web Stories, centre-cropped from a landscape hero (Google wants at least 640x853). */
export async function GET(req: NextRequest) {
  const src = req.nextUrl.searchParams.get('src') ?? ''
  let target: URL
  try {
    target = new URL(src, siteUrl())
  } catch {
    return new Response('bad src', { status: 400 })
  }
  // Only our own media: this must not become an open image proxy
  if (target.origin !== new URL(siteUrl()).origin || !target.pathname.startsWith('/api/media/file/')) {
    return new Response('src must be a Zaviya media file', { status: 400 })
  }
  const upstream = await fetch(absoluteUrl(target.pathname), { signal: AbortSignal.timeout(15_000) }).catch(() => null)
  if (!upstream?.ok) return new Response('image not found', { status: 404 })
  const input = Buffer.from(await upstream.arrayBuffer())
  const body = await sharp(input)
    .resize(STORY_POSTER_WIDTH, STORY_POSTER_HEIGHT, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 82 })
    .toBuffer()
  return new Response(new Uint8Array(body), {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400, s-maxage=604800, immutable' },
  })
}
