import { NextResponse } from 'next/server'
import { z } from 'zod'
import { botReason, classifySource, deviceFromUa, isBot, recordBotHit, recordPageview, visitorId } from '@/lib/analytics'
import { isMetaIp } from '@/lib/ip-ranges'
import { siteUrl } from '@/lib/seo'

const bodySchema = z.object({
  path: z.string().min(1).max(2048),
  locale: z.enum(['en', 'ur']).optional(),
  referrer: z.string().max(2048).optional(),
  utmSource: z.string().max(100).optional(),
})

const NOT_HUMAN = () => NextResponse.json({ human: false })

/**
 * Privacy-friendly first-party pageview beacon (no cookies, no IP storage). It also answers whether the visitor is a
 * person, so the page loads Google Analytics only for people: Meta's link checkers open every link we post with a
 * real browser from its data centres (US, Sweden, Ireland), which showed up as Facebook traffic in both counters.
 */
export async function POST(request: Request) {
  const ua = request.headers.get('user-agent')
  const reason = botReason(ua)
  if (reason === 'stale-desktop-ua') {
    // Suspected scraper with a spoofed browser agent: count it apart from visitors, never as direct (ZAV-260)
    const parsedBot = bodySchema.safeParse(await request.json().catch(() => null))
    if (parsedBot.success) await recordBotHit({ path: parsedBot.data.path, reason, device: deviceFromUa(ua ?? '') }).catch(() => undefined)
    return NOT_HUMAN()
  }
  if (isBot(ua)) return NOT_HUMAN()
  const ip = (request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for') ?? '').split(',')[0]!.trim()
  if (isMetaIp(ip)) {
    console.info(`[analytics] skipped a Meta crawler view (${request.headers.get('cf-ipcountry') ?? '?'})`)
    return NOT_HUMAN()
  }

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return new NextResponse(null, { status: 400 })
  }
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) return new NextResponse(null, { status: 400 })

  const { path, locale, referrer, utmSource } = parsed.data
  if (path.startsWith('/admin') || path.startsWith('/api')) return NextResponse.json({ human: true })

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
  return NextResponse.json({ human: true })
}
