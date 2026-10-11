import { createSign } from 'node:crypto'

/**
 * Minimal Google Search Console client using a service account (no SDK).
 * Env: GSC_SERVICE_ACCOUNT_JSON (the key file contents) and GSC_SITE_URL
 * (e.g. "sc-domain:zaviya.pk"). Add the service account's email as a user in Search Console.
 */

interface ServiceAccount {
  client_email: string
  private_key: string
}

export interface GscRow {
  keys: string[]
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export function gscConfigured(): boolean {
  return Boolean(process.env.GSC_SERVICE_ACCOUNT_JSON && process.env.GSC_SITE_URL)
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64url')

let cached: { token: string; exp: number } | null = null

async function accessToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token
  const sa = JSON.parse(process.env.GSC_SERVICE_ACCOUNT_JSON!) as ServiceAccount
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/webmasters.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  )
  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${claim}`)
  const jwt = `${header}.${claim}.${b64url(signer.sign(sa.private_key))}`
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`GSC token failed (${res.status})`)
  const data = (await res.json()) as { access_token: string; expires_in: number }
  cached = { token: data.access_token, exp: Date.now() + data.expires_in * 1000 }
  return data.access_token
}

export async function gscQuery(opts: {
  startDate: string
  endDate: string
  dimensions: ('page' | 'query' | 'date')[]
  rowLimit?: number
  pageFilter?: string
}): Promise<GscRow[]> {
  const token = await accessToken()
  const site = encodeURIComponent(process.env.GSC_SITE_URL!)
  const res = await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${site}/searchAnalytics/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startDate: opts.startDate,
      endDate: opts.endDate,
      dimensions: opts.dimensions,
      rowLimit: opts.rowLimit ?? 1000,
      ...(opts.pageFilter
        ? { dimensionFilterGroups: [{ filters: [{ dimension: 'page', operator: 'equals', expression: opts.pageFilter }] }] }
        : {}),
    }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`GSC query failed (${res.status}): ${(await res.text()).slice(0, 200)}`)
  const data = (await res.json()) as { rows?: GscRow[] }
  return data.rows ?? []
}

export const isoDay = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10)
