import { after, NextResponse } from 'next/server'
import { deviceFromUa, isBot, recordPageview, visitorId } from '@/lib/analytics'
import { parseEmbedParams, renderRatesEmbed } from '@/lib/embed-rates'
import { getRatesTicker } from '@/lib/queries'
import { siteUrl } from '@/lib/seo'

export const dynamic = 'force-dynamic'

/**
 * ZAV-110: embeddable rates card for other sites. Plain HTML, no script, no cookies. Each request is counted by the
 * embedding page's host (Referer) in zaviya_pageviews with source 'embed'; the CDN may serve repeats from its 5-minute cache.
 */
export async function GET(request: Request) {
  const { type, theme } = parseEmbedParams(new URL(request.url).searchParams)
  const ticks = await getRatesTicker('en').catch(() => [])
  const html = renderRatesEmbed(ticks, { type, theme, origin: siteUrl() })

  const ua = request.headers.get('user-agent')
  const referer = request.headers.get('referer') ?? undefined
  if (!isBot(ua)) {
    const ip = (request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for') ?? '').split(',')[0]!.trim()
    let refHost: string | undefined
    try {
      refHost = referer ? new URL(referer).hostname : undefined
    } catch {
      refHost = undefined
    }
    if (refHost !== new URL(siteUrl()).hostname) {
      after(async () => {
        try {
          await recordPageview({
            path: `/embed/rates?type=${type}`,
            source: 'embed',
            refHost,
            device: deviceFromUa(ua ?? ''),
            country: request.headers.get('cf-ipcountry') ?? undefined,
            visitor: visitorId(ip, ua ?? ''),
          })
        } catch (e) {
          console.error('[embed] pageview insert failed', e)
        }
      })
    }
  }

  return new NextResponse(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=600',
      'x-robots-tag': 'noindex, follow',
      'content-security-policy': 'frame-ancestors *',
    },
  })
}
