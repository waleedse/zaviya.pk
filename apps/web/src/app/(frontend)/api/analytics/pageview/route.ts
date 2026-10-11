import { NextResponse } from 'next/server'
import { z } from 'zod'
import { classifySource, deviceFromUa, isBot, recordPageview, visitorId } from '@/lib/analytics'
import { siteUrl } from '@/lib/seo'

const bodySchema = z.object({
  path: z.string().min(1).max(2048),
  locale: z.enum(['en', 'ur']).optional(),
  referrer: z.string().max(2048).optional(),
  utmSource: z.string().max(100).optional(),
})

/** Privacy-friendly first-party pageview beacon (no cookies, no IP storage). */
export async function POST(request: Request) {
  const ua = request.headers.get('user-agent')
  if (isBot(ua)) return new NextResponse(null, { status: 204 })

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return new NextResponse(null, { status: 400 })
  }
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) return new NextResponse(null, { status: 400 })

  const { path, locale, referrer, utmSource } = parsed.data
  if (path.startsWith('/admin') || path.startsWith('/api')) return new NextResponse(null, { status: 204 })

  const ip = (request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for') ?? '').split(',')[0]!.trim()
  let refHost: string | undefined
  try {
    refHost = referrer ? new URL(referrer).hostname : undefined
  } catch {
    refHost = undefined
  }

  try {
    await recordPageview({
      path,
      locale,
      source: classifySource(referrer, utmSource, new URL(siteUrl()).hostname),
      refHost,
      device: deviceFromUa(ua ?? ''),
      country: request.headers.get('cf-ipcountry') ?? undefined,
      visitor: visitorId(ip, ua ?? ''),
    })
  } catch (e) {
    console.error('[analytics] pageview insert failed', e)
  }
  return new NextResponse(null, { status: 204 })
}
