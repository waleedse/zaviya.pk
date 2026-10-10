const cache = new Map<string, { ok: boolean; expires: number }>()
const TTL_MS = 60 * 60 * 1000

export async function isAllowedByRobots(
  pageUrl: string,
  userAgent = 'ZaviyaBot/0.1 (+https://zaviya.pk/p/about)',
  fetchFn: typeof fetch = fetch,
): Promise<boolean> {
  let origin: string
  try {
    origin = new URL(pageUrl).origin
  } catch {
    return false
  }
  const cached = cache.get(origin)
  if (cached && cached.expires > Date.now()) return cached.ok

  try {
    const res = await fetchFn(`${origin}/robots.txt`, {
      headers: { 'User-Agent': userAgent },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      cache.set(origin, { ok: true, expires: Date.now() + TTL_MS })
      return true
    }
    const text = await res.text()
    const ok = parseRobots(text, new URL(pageUrl).pathname, userAgent)
    cache.set(origin, { ok, expires: Date.now() + TTL_MS })
    return ok
  } catch {
    return true
  }
}

function parseRobots(txt: string, path: string, ua: string): boolean {
  const blocks = txt.split(/\n(?=User-agent:)/i)
  let rules = blocks.find((b) => /User-agent:\s*\*/i.test(b))
  const specific = blocks.find((b) => b.toLowerCase().includes(`user-agent: ${ua.split('/')[0]!.toLowerCase()}`))
  if (specific) rules = specific
  if (!rules) return true
  const disallows = [...rules.matchAll(/Disallow:\s*(.*)/gi)].map((m) => m[1]!.trim())
  for (const d of disallows) {
    if (!d) continue
    if (path.startsWith(d)) return false
  }
  return true
}
