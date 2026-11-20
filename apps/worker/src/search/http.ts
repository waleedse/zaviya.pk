import { ZAVIYA_USER_AGENT } from '../ingest/extract.js'
import { isAllowedByRobots } from '../ingest/robots.js'

/** Polite per-host fetching for the product crawler: robots.txt, Zaviya's own user agent, at least 1.5 s between requests to one host. Never rotates agents or evades blocks. */
const lastHit = new Map<string, number>()
export const HOST_DELAY_MS = 1500

export async function politeJson<T>(url: string, opts: { timeoutMs?: number } = {}): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  let host: string
  try {
    host = new URL(url).host
  } catch {
    return { ok: false, status: 0, error: 'bad url' }
  }
  if (!(await isAllowedByRobots(url, ZAVIYA_USER_AGENT))) return { ok: false, status: 0, error: 'robots.txt disallows' }
  const wait = (lastHit.get(host) ?? 0) + HOST_DELAY_MS - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastHit.set(host, Date.now())
  try {
    const res = await fetch(url, { headers: { 'User-Agent': ZAVIYA_USER_AGENT, Accept: 'application/json' }, redirect: 'follow', signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000) })
    if (!res.ok) return { ok: false, status: res.status, error: `http ${res.status}` }
    return { ok: true, data: (await res.json()) as T }
  } catch (e) {
    return { ok: false, status: 0, error: String((e as Error).message).slice(0, 120) }
  }
}
