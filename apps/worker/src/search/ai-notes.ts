import type { LLMRouter } from '@zaviya/llm'

/**
 * AI notes on product pages (26 Nov redesign): for the most popular products sold by 2+ stores, a short plain-language note on which store
 * deal is best and who the product suits. Low priority on the LLM budget ('seo' task), 2 products per run, each note kept 7 days.
 * The page always shows the rule-based pick too, and says the AI note can be wrong.
 */
type Request = (method: string, path: string, body?: unknown, opts?: { timeoutMs?: number }) => Promise<unknown>

interface Todo {
  id: string
  title: string
  brand: string | null
  category: string
  offers: { store: string; price: number; listPrice: number | null; inStock: boolean }[]
  similar: { title: string; price: number }[]
}

export function notePrompt(p: Todo): string {
  const offers = p.offers.map((o) => `- ${o.store}: Rs ${o.price.toLocaleString('en-US')}${o.listPrice ? ` (store's list price Rs ${o.listPrice.toLocaleString('en-US')})` : ''}, ${o.inStock ? 'in stock' : 'out of stock'}`).join('\n')
  const similar = p.similar.map((s) => `- ${s.title}: from Rs ${s.price.toLocaleString('en-US')}`).join('\n')
  return `You write a short buying note for a Pakistani price-comparison page. Use ONLY the facts below; do not invent specs, ratings, warranty or delivery details.

Product: ${p.title}${p.brand ? ` (brand ${p.brand})` : ''}
Category: ${p.category}
Store prices today:
${offers}
Similar products on the site:
${similar || '- none'}

Write 2 or 3 plain English sentences, at most 70 words: which store is the best deal today and why (price, stock, discount against its own list price), and, only if the facts support it, who this product suits better than the similar ones. No headings, no bullet points, no emoji, no claims you cannot see above.`
}

/** A note is usable when it is plain prose of sensible length with no markup */
export function cleanNote(text: string): string | null {
  const t = text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/[*#`>_]/g, '').replace(/\s+/g, ' ').trim()
  if (t.length < 60 || t.length > 700) return null
  return t
}

export async function runAiNotes(deps: { request: Request; router: LLMRouter }, n = 2): Promise<{ written: number; skipped: number }> {
  const todo = ((await deps.request('POST', '/api/pipeline/search/ai-todo', { limit: n }, { timeoutMs: 30_000 })) as { items?: Todo[] }).items ?? []
  let written = 0
  let skipped = 0
  for (const p of todo) {
    try {
      const res = await deps.router.chat('seo', { messages: [{ role: 'user', content: notePrompt(p) }], temperature: 0.3, maxTokens: 300, timeoutMs: 90_000 })
      const note = cleanNote(res.content)
      if (!note) {
        skipped++
        continue
      }
      await deps.request('POST', '/api/pipeline/search/ai-note', { productId: p.id, note, model: `${res.provider}:${res.model}`.slice(0, 80) }, { timeoutMs: 20_000 })
      written++
    } catch {
      skipped++
    }
  }
  return { written, skipped }
}
