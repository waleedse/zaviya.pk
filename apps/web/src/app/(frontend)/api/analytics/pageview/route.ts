import { NextResponse } from 'next/server'
import { z } from 'zod'

const bodySchema = z.object({
  path: z.string().min(1).max(2048),
  locale: z.enum(['en', 'ur']).optional(),
  referrer: z.string().max(2048).optional(),
})

/** Privacy-friendly first-party pageview beacon (no cookies, no IP storage). */
export async function POST(request: Request) {
  let json: unknown
  try {
    json = await request.json()
  } catch {
    return new NextResponse(null, { status: 400 })
  }

  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return new NextResponse(null, { status: 400 })
  }

  const { path, locale } = parsed.data
  if (process.env.NODE_ENV === 'development') {
    console.info('[analytics:pageview]', { path, locale })
  }

  return new NextResponse(null, { status: 204 })
}
