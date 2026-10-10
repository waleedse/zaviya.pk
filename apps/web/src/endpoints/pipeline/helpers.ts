import type { PayloadRequest } from 'payload'
import { z } from 'zod'
import { getRole } from '../../access'

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status })
}

export function unauthorized(): Response {
  return json({ error: 'Unauthorized' }, 401)
}

export function badRequest(error: string, issues?: unknown): Response {
  return json({ error, issues }, 400)
}

export function requireBotOrAdmin(req: PayloadRequest): Response | null {
  const role = getRole(req)
  if (role !== 'bot' && role !== 'admin') return unauthorized()
  return null
}

export async function parseJson<T>(req: PayloadRequest, schema: z.ZodType<T>): Promise<{ data: T } | { error: Response }> {
  let body: unknown
  try {
    body = await req.json!()
  } catch {
    return { error: badRequest('Invalid JSON body') }
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return { error: badRequest('Validation failed', parsed.error.flatten()) }
  }
  return { data: parsed.data }
}

export function embeddingToPgVector(embedding: number[]): string {
  return `[${embedding.join(',')}]`
}

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export async function articlePublicUrls(
  payload: PayloadRequest['payload'],
  articleId: string,
): Promise<{ en?: string; ur?: string }> {
  const doc = await payload.findByID({
    collection: 'articles',
    id: articleId,
    depth: 1,
    locale: 'all',
    overrideAccess: true,
  })
  const category = doc.category
  const categorySlug =
    typeof category === 'object' && category !== null ? String((category as { slug: string }).slug) : ''
  const slug = doc.slug as Record<string, string> | string | undefined
  const urls: { en?: string; ur?: string } = {}
  if (typeof slug === 'object') {
    if (slug.en) urls.en = `${siteUrl()}/${categorySlug}/${slug.en}`
    if (slug.ur) urls.ur = `${siteUrl()}/ur/${categorySlug}/${slug.ur}`
  }
  return urls
}
