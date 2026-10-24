import { NextResponse } from 'next/server'
import { z } from 'zod'
import { normalizeEmail, subscribe } from '@/lib/newsletter'

const bodySchema = z.object({
  email: z.string().max(320),
  locale: z.enum(['en', 'ur']).default('en'),
  source: z.string().max(60).default('site'),
  website: z.string().max(200).optional(), // honeypot: people leave it empty
})

/** Starts the double opt-in. Always answers the same way for a good address so it cannot be used to probe the list. */
export async function POST(request: Request) {
  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'bad-request' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'bad-request' }, { status: 400 })
  if (parsed.data.website) return NextResponse.json({ ok: true }) // bot: pretend it worked
  const email = normalizeEmail(parsed.data.email)
  if (!email) return NextResponse.json({ ok: false, error: 'invalid-email' }, { status: 422 })
  const ip = (request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for') ?? '').split(',')[0]!.trim()
  try {
    const result = await subscribe({ email, locale: parsed.data.locale, source: parsed.data.source, ip })
    if (result === 'rate-limited') return NextResponse.json({ ok: false, error: 'rate-limited' }, { status: 429 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[newsletter] subscribe failed', e)
    return NextResponse.json({ ok: false, error: 'server' }, { status: 500 })
  }
}
