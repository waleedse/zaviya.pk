/** The newsroom keeps Instagram to 3 hashtags (the platform's hard limit is 5). */
export const IG_HASHTAG_CAP = 3

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

/** "State Bank of Pakistan" -> "#StateBankOfPakistan"; ASCII only, 3-24 chars, not generic or numeric. */
export function toHashtag(raw: string): string | null {
  const parts = raw.normalize('NFKD').replace(/[^\x00-\x7F]/g, '').split(/[^A-Za-z0-9]+/).filter(Boolean)
  if (!parts.length) return null
  const camel = parts.map((p) => p[0]!.toUpperCase() + p.slice(1)).join('')
  if (camel.length < 3 || camel.length > 24 || /^\d+$/.test(camel) || GENERIC.has(camel.toLowerCase())) return null
  return `#${camel}`
}

/** Specific topics people search (from the story's tags, ones named in the headline first), then the category tags, then the brand last. */
export function pickHashtags(opts: { tags: string[]; category: string; title: string; trends?: string[]; cap?: number }): string[] {
  const cap = opts.cap ?? IG_HASHTAG_CAP
  const title = opts.title.toLowerCase()
  const out: string[] = []
  const add = (h: string | null) => {
    if (h && !out.some((o) => o.toLowerCase() === h.toLowerCase())) out.push(h)
  }
  // a trending term that the story really mentions
  for (const t of opts.trends ?? []) if (t.trim() && title.includes(t.trim().toLowerCase())) add(toHashtag(t))
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
  const tags = pickHashtags(story)
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
