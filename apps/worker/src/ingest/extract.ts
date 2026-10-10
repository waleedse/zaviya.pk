import { Readability } from '@mozilla/readability'
import { parseHTML } from 'linkedom'

export const ZAVIYA_USER_AGENT = 'ZaviyaBot/0.1 (+https://zaviya.pk/p/about)'
const MAX_BYTES = 2 * 1024 * 1024
const MAX_CHARS = 6000

export async function fetchArticleText(
  url: string,
  fetchFn: typeof fetch = fetch,
): Promise<string | null> {
  const res = await fetchFn(url, {
    headers: { 'User-Agent': ZAVIYA_USER_AGENT },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) return null
  const buf = await res.arrayBuffer()
  if (buf.byteLength > MAX_BYTES) return null
  const html = new TextDecoder('utf-8', { fatal: false }).decode(buf)
  const { document } = parseHTML(html)
  const reader = new Readability(document as unknown as Document)
  const article = reader.parse()
  const text = article?.textContent?.trim() ?? ''
  if (!text) return null
  return text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text
}
