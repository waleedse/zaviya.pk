import { NextResponse } from 'next/server'
import { z } from 'zod'
import { deviceFromUa, isBot, recordShareClick, SHARE_CHANNELS } from '@/lib/analytics'

const bodySchema = z.object({
  channel: z.enum(SHARE_CHANNELS),
  path: z.string().min(1).max(2048),
})

/** Counts a click on a share button (source 'whatsapp-share', 'facebook-share', ...). No cookies, no IP stored. */
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
  const { channel, path } = parsed.data
  if (path.startsWith('/admin') || path.startsWith('/api')) return new NextResponse(null, { status: 204 })
  try {
    await recordShareClick({ path, channel, locale: path.startsWith('/ur') ? 'ur' : 'en', device: deviceFromUa(ua ?? '') })
  } catch (e) {
    console.error('[analytics] share click insert failed', e)
  }
  return new NextResponse(null, { status: 204 })
}
