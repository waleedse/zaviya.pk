import { z } from 'zod'
import { zodToJsonSchema, type LLMRouter } from '@zaviya/llm'
import type { Redis } from 'ioredis'
import type { ClusterDetail, PayloadClient } from '../payload-client.js'
import { TRENDS_KEY } from '../queues-keys.js'
import { X_TRENDS_KEY } from '../ingest/discovery.js'
import { logger } from '../logger.js'

/**
 * Keyword research before writing: what Pakistanis actually type into Google
 * (English, Urdu and Roman Urdu), what is trending right now, and whether we
 * already have an article that should be updated instead of duplicated.
 */

export const SeedQueriesSchema = z.object({
  en: z.array(z.string()).min(1).max(4),
  ur: z.array(z.string()).max(3),
  romanUrdu: z.array(z.string()).max(3),
})

export const SeoPlanSchema = z.object({
  primaryKeyword: z.string().min(3),
  secondaryKeywords: z.array(z.string()).max(8),
  urduKeywords: z.array(z.string()).max(6),
  romanUrduQueries: z.array(z.string()).max(6),
  searchIntent: z.enum(['news', 'explainer', 'how-to', 'price-check', 'result-check', 'live']),
  titleAngle: z.string(),
  faqQuestions: z.array(z.string()).max(6),
})
export type SeoPlan = z.infer<typeof SeoPlanSchema>

export interface SeoResearch {
  plan: SeoPlan
  suggestions: Record<string, string[]>
  matchedTrends: string[]
  existing?: { title: string; url: string; similarity: number }
}

const SUGGEST_URL = 'https://suggestqueries.google.com/complete/search'

export async function googleSuggest(q: string, hl: 'en' | 'ur', fetchFn: typeof fetch = fetch): Promise<string[]> {
  try {
    const url = `${SUGGEST_URL}?client=firefox&hl=${hl}&gl=pk&q=${encodeURIComponent(q)}`
    const res = await fetchFn(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return []
    const data = (await res.json()) as [string, string[]]
    return Array.isArray(data?.[1]) ? data[1].slice(0, 10) : []
  } catch {
    return []
  }
}

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2),
  )
}

/** Trends that share at least two words (or one rare long word) with the story. */
export function matchTrends(storyText: string, trendNames: string[]): string[] {
  const story = tokens(storyText)
  return trendNames.filter((name) => {
    const t = [...tokens(name.replace(/^#/, '').replace(/([a-z])([A-Z])/g, '$1 $2'))]
    const hits = t.filter((w) => story.has(w))
    return hits.length >= 2 || hits.some((w) => w.length >= 7)
  })
}

async function readTrendNames(redis?: Redis): Promise<string[]> {
  if (!redis) return []
  const names: string[] = []
  for (const key of [TRENDS_KEY, X_TRENDS_KEY]) {
    try {
      const raw = await redis.get(key)
      if (!raw) continue
      const parsed = JSON.parse(raw) as { trends?: { query?: string; name?: string }[] }
      for (const t of parsed.trends ?? []) names.push(t.query ?? t.name ?? '')
    } catch {
      /* ignore */
    }
  }
  return names.filter(Boolean)
}

function storySummary(cluster: ClusterDetail): string {
  return cluster.items
    .slice(0, 6)
    .map((i) => `- ${i.title}${i.summary ? ` — ${i.summary.slice(0, 200)}` : ''}`)
    .join('\n')
}

export async function researchSeo(
  cluster: ClusterDetail,
  deps: { router: LLMRouter; payload: PayloadClient; redis?: Redis; fetchFn?: typeof fetch },
): Promise<SeoResearch | null> {
  const summary = storySummary(cluster)
  try {
    const seedsRes = await deps.router.chat('seo', {
      messages: [
        {
          role: 'system',
          content:
            'You are an SEO researcher for a Pakistani news site. Given a story, propose the short search queries (2-4 words) people in Pakistan would type into Google to find it: English, Urdu script, and Roman Urdu. Output JSON only.',
        },
        { role: 'user', content: `Story:\n${summary}` },
      ],
      format: zodToJsonSchema(SeedQueriesSchema, { target: 'openApi3' }) as Record<string, unknown>,
      temperature: 0.2,
      maxTokens: 600,
    })
    const seeds = SeedQueriesSchema.parse(JSON.parse(seedsRes.content))

    const suggestions: Record<string, string[]> = {}
    await Promise.all([
      ...seeds.en.map(async (q) => (suggestions[q] = await googleSuggest(q, 'en', deps.fetchFn))),
      ...seeds.romanUrdu.map(async (q) => (suggestions[q] = await googleSuggest(q, 'en', deps.fetchFn))),
      ...seeds.ur.map(async (q) => (suggestions[q] = await googleSuggest(q, 'ur', deps.fetchFn))),
    ])

    const matchedTrends = matchTrends(summary, await readTrendNames(deps.redis))

    const headline = cluster.headline ?? cluster.items[0]?.title ?? ''
    const existingCheck = await deps.payload.titleCheck(headline, 'en').catch(() => null)
    const existing =
      existingCheck?.closest && existingCheck.maxSimilarity >= 0.5
        ? { ...existingCheck.closest, similarity: existingCheck.maxSimilarity }
        : undefined

    const planRes = await deps.router.chat('seo', {
      messages: [
        {
          role: 'system',
          content: `You plan SEO for one Pakistani news article. Pick keywords ONLY from the real Google suggestions and trends provided (you may lightly normalise them). Prefer specific, high-intent phrases ("petrol price in pakistan today") over generic ones ("petrol"). The primary keyword must fit naturally in a factual headline. FAQ questions must be things people actually ask, phrased like the suggestions. No clickbait. Output JSON only.`,
        },
        {
          role: 'user',
          content: [
            `Story:\n${summary}`,
            `Google autocomplete (Pakistan):\n${Object.entries(suggestions)
              .map(([q, s]) => `${q} → ${s.join(' | ') || '(none)'}`)
              .join('\n')}`,
            `Trending now that matches this story: ${matchedTrends.join(', ') || 'none'}`,
            existing ? `We already covered something similar: "${existing.title}". Choose a distinct angle.` : '',
          ]
            .filter(Boolean)
            .join('\n\n'),
        },
      ],
      format: zodToJsonSchema(SeoPlanSchema, { target: 'openApi3' }) as Record<string, unknown>,
      temperature: 0.2,
      maxTokens: 1200,
    })
    const plan = SeoPlanSchema.parse(JSON.parse(planRes.content))
    // Small models sometimes return the whole headline as the "keyword": fall back to a real search phrase.
    if (plan.primaryKeyword.split(/\s+/).length > 6) {
      const firstSeed = seeds.en[0] ?? ''
      plan.primaryKeyword = suggestions[firstSeed]?.[0] ?? firstSeed
    }
    return { plan, suggestions, matchedTrends, existing }
  } catch (e) {
    logger.warn({ err: e instanceof Error ? e.message : e, clusterId: cluster.id }, 'SEO research skipped')
    return null
  }
}

/** Instructions appended to the writer prompt. */
export function seoBrief(plan: SeoPlan, locale: 'en' | 'ur'): string {
  if (locale === 'ur') {
    return `SEO plan (use naturally, never stuff):
- Use these Urdu search phrases in the title, the first paragraph and one subheading: ${plan.urduKeywords.join('، ') || plan.primaryKeyword}
- Add FAQ entries in Roman Urdu for: ${plan.romanUrduQueries.join(' | ') || 'none'}
- Search intent: ${plan.searchIntent}`
  }
  return `SEO plan (use naturally; keyword stuffing gets the site penalised):
- Primary keyword (a topic hint, not text to paste): "${plan.primaryKeyword}" → in at least one title option, the dek and the first paragraph, written with proper capitalization and grammar. 2-4 uses in the body in total.
- Secondary keywords: use at most one or two where they read naturally: ${plan.secondaryKeywords.join(', ') || 'none'}
- Angle for the headline: ${plan.titleAngle}
- Search intent: ${plan.searchIntent}. Answer the reader's question in the first paragraph.
- FAQs may use these real searches only where the sources answer them (skip any the sources cannot answer, never invent a fact to answer one), each rewritten as a complete natural question (never the raw query or a bracketed phrase): ${plan.faqQuestions.join(' | ') || 'none'}; add Roman Urdu FAQs for: ${plan.romanUrduQueries.join(' | ') || 'none'}
- Structure the body with 2-4 "## " subheadings.`
}

/** Soft QA: the article should actually target its keyword. */
export function checkKeywordUsage(plan: SeoPlan, en: { title: string; dek: string; bodyMarkdown: string }): string[] {
  const kw = plan.primaryKeyword.toLowerCase()
  const words = kw.split(/\s+/).filter((w) => w.length > 2)
  const has = (text: string) => {
    const t = text.toLowerCase()
    return t.includes(kw) || words.filter((w) => t.includes(w)).length >= Math.ceil(words.length * 0.75)
  }
  const issues: string[] = []
  if (!has(`${en.title} ${en.dek}`)) issues.push(`SEO: primary keyword "${plan.primaryKeyword}" missing from title/dek`)
  if (!has(en.bodyMarkdown.slice(0, 800))) issues.push(`SEO: primary keyword "${plan.primaryKeyword}" missing from the opening paragraphs`)
  if (!/^##\s+/m.test(en.bodyMarkdown)) issues.push('SEO: body has no "## " subheadings')
  const uses = en.bodyMarkdown.toLowerCase().split(kw).length - 1
  if (uses > 5) issues.push(`SEO: keyword stuffing — "${plan.primaryKeyword}" appears ${uses} times; use it 2-4 times naturally`)
  // A lowercase brand/country name inside a sentence is the tell-tale sign of pasted keywords.
  if (/[a-z,] pakistan\b/.test(en.bodyMarkdown)) issues.push('Style: "pakistan" must be capitalised')
  return issues
}
