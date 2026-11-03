import { TRENDS_KEY, X_TRENDS_KEY } from '../queues-keys.js'

/** The newsroom keeps Instagram to 3 hashtags (the platform's hard limit is 5). */
export const IG_HASHTAG_CAP = 3
/** At most this many of them may be trending-topic tags (the brand tag always takes the last place). */
export const TREND_TAG_CAP = 2

const GENERIC = new Set(['news', 'latest', 'update', 'updates', 'today', 'breaking', 'live', 'top', 'story', 'stories', 'pakistan'])

const CATEGORY_TAGS: Record<string, string[]> = {
  pakistan: ['#PakistanNews'],
  business: ['#PakistanEconomy', '#Business'],
  world: ['#WorldNews'],
  'tech-telecom': ['#TechPakistan'],
  ai: ['#AI'],
  cricket: ['#PakistanCricket', '#Cricket'],
  sports: ['#PakistanSports', '#Sports'],
  'education-jobs': ['#JobsInPakistan'],
}

// ---- trending terms (Google Trends PK and X trends), kept in memory by whoever reads those feeds ----------------------

const TRENDS_MAX_AGE_MS = 6 * 3_600_000
const trendingBySource = new Map<string, { terms: string[]; at: number }>()

/** Remembers the current trending terms of one feed ('google' or 'x'); social posts match their story against them. */
export function rememberTrends(source: string, terms: string[], at = Date.now()): void {
  trendingBySource.set(source, { terms: terms.map((t) => t.trim()).filter(Boolean).slice(0, 40), at })
}

/** The trending terms of the last 6 hours, Google Trends first. */
export function currentTrends(now = Date.now()): string[] {
  const out: string[] = []
  for (const source of ['google', 'x', ...trendingBySource.keys()]) {
    const entry = trendingBySource.get(source)
    if (entry && now - entry.at <= TRENDS_MAX_AGE_MS) for (const t of entry.terms) if (!out.includes(t)) out.push(t)
  }
  return out
}

/** After a restart: reads the feeds' last snapshots back from Redis so the first posts already know what trends. */
export async function hydrateTrends(redis: { get(key: string): Promise<string | null> }): Promise<void> {
  for (const [source, key] of [['google', TRENDS_KEY], ['x', X_TRENDS_KEY]] as const) {
    try {
      const raw = await redis.get(key)
      if (!raw) continue
      const snap = JSON.parse(raw) as { at?: string; trends?: { query?: string; name?: string }[] }
      const at = snap.at ? Date.parse(snap.at) : NaN
      rememberTrends(source, (snap.trends ?? []).map((t) => t.query ?? t.name ?? ''), Number.isFinite(at) ? at : Date.now())
    } catch {
      // a missing or unreadable snapshot just means no trending tags until the next fetch
    }
  }
}

/** Political parties, their leaders and the army are never hashtagged (legal and ban risk in Pakistan). */
const PARTY_ACRONYMS = new Set(['pti', 'pmln', 'pmlq', 'ppp', 'mqm', 'tlp', 'jui', 'juif', 'anp', 'ispr'])
const PARTY_PARTS = ['tehreekeinsaf', 'muslimleague', 'peoplesparty', 'imrankhan', 'nawazsharif', 'shehbazsharif', 'maryamnawaz', 'zardari', 'bilawal', 'pakistanarmy', 'armychief', 'asimmunir']
export function isPartyTag(tag: string): boolean {
  const bare = tag.replace(/^#/, '')
  // CamelCase words: "#PTIRally" -> PTI, Rally
  const words = (bare.match(/[A-Z]+(?![a-z])|[A-Z]?[a-z]+|\d+/g) ?? []).map((w) => w.toLowerCase())
  const joined = bare.toLowerCase()
  return words.some((w) => PARTY_ACRONYMS.has(w)) || PARTY_PARTS.some((p) => joined.includes(p))
}

const TREND_STOP = new Set(['today', 'price', 'prices', 'rate', 'rates', 'live', 'score', 'match', 'full', 'online', 'result', 'results', 'date', 'time', 'schedule', 'watch', 'video', 'free', 'download', 'with', 'from', 'that', 'this', 'what', 'when', 'where', 'near', 'after'])
const stemWord = (w: string) => w.replace(/(ing|ed)$/, '').replace(/(es|s)$/, '').replace(/e$/, '')
const wordsOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !GENERIC.has(w) && !TREND_STOP.has(w))

/**
 * The hashtag for a trending term when the story is about it, else null. The whole term in the headline, or at least two of its
 * words (one, if the term is a single word of 4+ letters) in the headline or the story's tags. Never a party or army tag.
 */
export function trendHashtag(trend: string, story: { title: string; tags: string[] }): string | null {
  const term = trend.trim()
  if (!term) return null
  const haystack = `${story.title} ${story.tags.join(' ')}`.toLowerCase()
  const termWords = wordsOf(term)
  let tag: string | null = null
  if (haystack.includes(term.toLowerCase()) && term.split(/\s+/).length <= 3) tag = toHashtag(term)
  else {
    const hay = new Set(wordsOf(haystack).map(stemWord))
    const hit = termWords.filter((w) => hay.has(stemWord(w)))
    const enough = termWords.length === 1 ? hit.length === 1 && hit[0]!.length >= 4 : hit.length >= 2
    if (enough) tag = toHashtag(hit.slice(0, 3).join(' '))
  }
  return tag && !isPartyTag(tag) ? tag : null
}

/** "State Bank of Pakistan" -> "#StateBankOfPakistan"; ASCII only, 3-24 chars, not generic or numeric. */
export function toHashtag(raw: string): string | null {
  const parts = raw.normalize('NFKD').replace(/[^\x00-\x7F]/g, '').split(/[^A-Za-z0-9]+/).filter(Boolean)
  if (!parts.length) return null
  const camel = parts.map((p) => p[0]!.toUpperCase() + p.slice(1)).join('')
  if (camel.length < 3 || camel.length > 24 || /^\d+$/.test(camel) || GENERIC.has(camel.toLowerCase())) return null
  return `#${camel}`
}

/**
 * A trending-topic tag first (when the story matches a Google Trends PK or X trend, at most two), then specific topics people search
 * (from the story's tags, ones named in the headline first), then the category tags, the brand always last. Three in all, never a party tag.
 */
export function pickHashtags(opts: { tags: string[]; category: string; title: string; trends?: string[]; cap?: number }): string[] {
  const cap = opts.cap ?? IG_HASHTAG_CAP
  const title = opts.title.toLowerCase()
  const out: string[] = []
  const add = (h: string | null) => {
    if (h && !isPartyTag(h) && !out.some((o) => o.toLowerCase() === h.toLowerCase())) out.push(h)
  }
  // a trending term that the story really mentions
  let trendTags = 0
  for (const t of opts.trends ?? []) {
    if (trendTags >= TREND_TAG_CAP) break
    const before = out.length
    add(trendHashtag(t, { title: opts.title, tags: opts.tags }))
    if (out.length > before) trendTags++
  }
  const ranked = opts.tags
    .map((t) => ({ h: toHashtag(t), score: (title.includes(t.toLowerCase()) ? 100 : 0) - t.length }))
    .filter((x): x is { h: string; score: number } => !!x.h)
    .sort((a, b) => b.score - a.score)
  for (const r of ranked.slice(0, 2)) add(r.h)
  for (const h of CATEGORY_TAGS[opts.category] ?? ['#PakistanNews']) add(h)
  add('#PakistanNews')
  const rest = out.filter((h) => h !== '#Zaviya').slice(0, cap - 1)
  return [...rest, '#Zaviya']
}

/** Removes hashtags the writer put in the text; they are added back by code so the count and choice are controlled. */
export function stripHashtags(text: string): string {
  return text.replace(/(^|\s)#[\p{L}\p{N}_]+/gu, '$1').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** Final copy per platform: the writer's description, no stray tags, and a controlled set of hashtags. */
export function finalizeCopy(
  copy: { facebook: string; instagram: string; x: string },
  story: { tags: string[]; category: string; title: string; trends?: string[] },
): { facebook: string; instagram: string; x: string } {
  const tags = pickHashtags({ ...story, trends: story.trends ?? currentTrends() })
  const fb = tags.slice(0, 2)
  const xTags = tags.slice(0, 2)
  const x = stripHashtags(copy.x)
  return {
    facebook: `${stripHashtags(copy.facebook)}\n\n${fb.join(' ')}`,
    instagram: `${stripHashtags(copy.instagram)}\n\n.\n${tags.join(' ')}`,
    // X counts a link as 23 characters; the 260-character writer limit leaves room for two tags
    x: x.length + 1 + xTags.join(' ').length <= 258 ? `${x} ${xTags.join(' ')}` : x,
  }
}
