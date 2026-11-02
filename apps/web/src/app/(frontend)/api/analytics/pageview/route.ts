import { NextResponse } from 'next/server'
import { z } from 'zod'
import { botReason, classifySource, deviceFromUa, isBot, recordBotHit, recordPageview, visitorId } from '@/lib/analytics'
import { isMetaIp } from '@/lib/ip-ranges'
import { BURST_SETTLE_MS, ipPrefix, isMetaPreviewCandidate, metaBursts, metaDrops } from '@/lib/meta-preview'
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
  const metaIp = isMetaIp(ip)

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return metaIp ? NOT_HUMAN() : new NextResponse(null, { status: 400 })
  }
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) return metaIp ? NOT_HUMAN() : new NextResponse(null, { status: 400 })

  const { path, locale, referrer, utmSource } = parsed.data
  const device = deviceFromUa(ua ?? '')
  const source = classifySource(referrer, utmSource, new URL(siteUrl()).hostname)
  const country = request.headers.get('cf-ipcountry') ?? undefined

  if (metaIp) {
    console.info(`[analytics] skipped a Meta crawler view (${country ?? '?'})`)
    if (source === 'facebook') metaBursts.note(path) // it is part of a burst that its non-Meta-IP siblings join
    metaDrops.note(path)
    await recordBotHit({ path, reason: 'meta-ip', device }).catch(() => undefined)
    return NOT_HUMAN()
  }
  if (path.startsWith('/admin') || path.startsWith('/api')) return NextResponse.json({ human: true })

  if (isMetaPreviewCandidate(source, country)) {
    // ZAV-290: Meta also opens links from addresses outside its network. Wait for the rest of the burst, then judge.
    metaBursts.note(path)
    await new Promise((resolve) => setTimeout(resolve, BURST_SETTLE_MS))
    // A lone follower of a burst whose other hits were dropped (Meta IPs or earlier burst members) never reaches the
    // threshold on its own; real Facebook readers are PK, so a facebook+US hit right after a Meta drop is Meta too.
    const burst = metaBursts.isBurst(path)
    if (burst || metaDrops.hasRecent(path)) {
      metaDrops.note(path)
      console.info(
        `[analytics] skipped a Meta preview ${burst ? 'burst' : 'follower'} view (${country}, ${ipPrefix(ip)}, ${metaBursts.count(path)} hits)`,
      )
      await recordBotHit({ path, reason: 'meta-preview', device }).catch(() => undefined)
      return NOT_HUMAN()
    }
  }

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
      source,
      refHost,
      device,
      country,
      visitor: visitorId(ip, ua ?? ''),
    })
  } catch (e) {
    console.error('[analytics] pageview insert failed', e)
  }
  return NextResponse.json({ human: true })
}
