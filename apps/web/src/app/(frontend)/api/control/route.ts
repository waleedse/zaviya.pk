import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { sql } from '@payloadcms/db-postgres'
import { z } from 'zod'
import { getPayloadClient } from '@/lib/payload'

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve'), reviewId: z.string(), clusterId: z.string() }),
  z.object({ action: z.literal('reject'), reviewId: z.string(), clusterId: z.string() }),
  z.object({ action: z.literal('kill'), on: z.boolean() }),
  z.object({ action: z.enum(['pause', 'resume', 'discover', 'ingest']) }),
])

/** Control Room actions. Admin/editor session required; worker picks commands up on its next heartbeat. */
export async function POST(request: Request) {
  const payload = await getPayloadClient()
  const { user } = await payload.auth({ headers: await headers() })
  const role = (user as { role?: string } | null)?.role
  if (!user || (role !== 'admin' && role !== 'editor')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  const body = parsed.data
  const by = `user:${user.id}`
  const db = payload.db.drizzle

  switch (body.action) {
    case 'approve':
    case 'reject': {
      await payload.update({
        collection: 'review-queue',
        id: body.reviewId,
        data: { decision: body.action, decidedBy: by, decidedAt: new Date().toISOString() },
        overrideAccess: true,
      })
      if (body.action === 'approve') {
        await db.execute(sql`INSERT INTO zaviya_commands (kind, payload, created_by) VALUES ('write', ${JSON.stringify({ clusterId: body.clusterId })}::jsonb, ${by})`)
      } else {
        await payload.update({ collection: 'story-clusters', id: body.clusterId, data: { status: 'rejected' }, overrideAccess: true })
      }
      break
    }
    case 'kill':
      await payload.updateGlobal({ slug: 'settings', data: { killSwitch: body.on }, overrideAccess: true })
      break
    default:
      await db.execute(sql`INSERT INTO zaviya_commands (kind, payload, created_by) VALUES (${body.action}, '{}'::jsonb, ${by})`)
  }
  return NextResponse.json({ ok: true })
}
