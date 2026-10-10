import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getPayloadClient } from '@/lib/payload'

const bodySchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  locale: z.enum(['en', 'ur']).optional(),
  userAgent: z.string().optional(),
})

export async function POST(request: Request) {
  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid subscription payload' }, { status: 400 })
  }

  const { endpoint, keys, locale, userAgent } = parsed.data
  const payload = await getPayloadClient()

  const existing = await payload.find({
    collection: 'push-subscriptions',
    where: { endpoint: { equals: endpoint } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  const data = {
    endpoint,
    keys,
    locale,
    userAgent: userAgent ?? request.headers.get('user-agent') ?? undefined,
  }

  if (existing.docs[0]) {
    await payload.update({
      collection: 'push-subscriptions',
      id: existing.docs[0].id,
      data,
      overrideAccess: true,
    })
  } else {
    await payload.create({
      collection: 'push-subscriptions',
      data,
      overrideAccess: true,
    })
  }

  return NextResponse.json({ ok: true })
}
