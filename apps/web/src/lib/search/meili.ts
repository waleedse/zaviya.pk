/** Thin Meilisearch client (docs/PRODUCT-SEARCH.md). The key stays on the server; callers fall back to Postgres search on errors. */
const URL_ = () => process.env.MEILI_URL || 'http://meilisearch:7700'

export const meiliConfigured = () => Boolean(process.env.MEILI_MASTER_KEY)

export async function meili<T = unknown>(method: string, path: string, body?: unknown, timeoutMs = 3000): Promise<T> {
  const res = await fetch(`${URL_()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.MEILI_MASTER_KEY ?? ''}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`meili ${method} ${path}: ${res.status} ${(await res.text()).slice(0, 200)}`)
  return (await res.json()) as T
}

export async function waitTask(uid: number, timeoutMs = 120_000): Promise<{ status: string; error?: unknown }> {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    const t = await meili<{ status: string; error?: unknown }>('GET', `/tasks/${uid}`)
    if (t.status === 'succeeded' || t.status === 'failed' || t.status === 'canceled') return t
    await new Promise((r) => setTimeout(r, 500))
  }
  return { status: 'timeout' }
}
