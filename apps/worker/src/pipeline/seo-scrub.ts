/**
 * ZAV-228: the writer kept pasting search phrases into headlines, deks, slugs and ledes
 * ("Microsoft layoffs news", "Pakistan cricket news", "news today", "live match").
 * A post-write scrub removes them, and a QA rule rejects whatever is left.
 */

/** Words that make "<word> news" ordinary English, not a pasted search phrase. */
const NEWS_OK_BEFORE = new Set(['breaking', 'latest', 'good', 'bad', 'fake', 'the', 'this', 'that', 'sad', 'big', 'any', 'no', 'some', 'more', 'such', 'old', 'sports'])

/** Topic words that, followed by "news", form a pasted keyword. */
const TOPIC = '(?:layoffs?|cricket|petrol|gold|dollar|rupee|stocks?|tech|weather|match|score|prices?|rates?|jobs?|exams?|results?|politics|business)'
const TOPIC_NEWS = new RegExp(`\\b((?:pakistan(?:i)?\\s+)?${TOPIC}(?:\\s+${TOPIC})?)\\s+news\\b`, 'gi')
const PAKISTAN_X_NEWS = /\b(pakistan(?:i)?\s+[\p{L}]+)\s+news\b/giu
const NEWS_TODAY = /[\s,:;|–—-]*\b(?:(?:latest|breaking)\s+)?news\s+today\b/gi
const LIVE_MATCH = /\blive\s+match\b/gi

function tidy(s: string): string {
  return s
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([:|–—-])\s*([:|–—-])+/g, '$1')
    .replace(/^[\s,:;|–—-]+|[\s,:;|–—-]+$/g, '')
    .trim()
}

/** Phrase-level scrub for one string. Keeps the topic words, drops the "news" tail. */
export function scrubSeoPhrases(text: string): string {
  if (!text) return text
  const out = text
    .replace(NEWS_TODAY, '')
    .replace(LIVE_MATCH, 'match')
    .replace(TOPIC_NEWS, '$1')
    .replace(PAKISTAN_X_NEWS, (m, lead: string) => {
      const second = lead.split(/\s+/)[1]?.toLowerCase() ?? ''
      return NEWS_OK_BEFORE.has(second) ? m : lead
    })
  return out === text ? text : tidy(out)
}

export function scrubSeoSlug(slug: string): string {
  const out = scrubSeoPhrases(slug.replace(/-/g, ' ')).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim().replace(/\s+/g, '-')
  return out.length >= 8 ? out : slug
}

/** Scrub the first prose paragraph (the lede) of a markdown body; later paragraphs are left alone. */
export function scrubLede(body: string): string {
  const parts = body.split(/\n{2,}/)
  const i = parts.findIndex((p) => p.trim() && !/^\s*(#|[-*>]|\d+\.)/.test(p))
  if (i < 0) return body
  parts[i] = scrubSeoPhrases(parts[i]!)
  return parts.join('\n\n')
}

export interface ScrubbableCopy {
  title: string
  titleOptions: string[]
  slug: string
  dek: string
  metaDescription?: string
  bodyMarkdown: string
}

/** Mutates and returns true when anything changed. */
export function scrubWriterCopy(part: ScrubbableCopy): boolean {
  const before = JSON.stringify([part.title, part.titleOptions, part.slug, part.dek, part.metaDescription, part.bodyMarkdown])
  part.title = scrubSeoPhrases(part.title)
  part.titleOptions = part.titleOptions.map(scrubSeoPhrases)
  part.slug = scrubSeoSlug(part.slug)
  part.dek = scrubSeoPhrases(part.dek)
  if (part.metaDescription) part.metaDescription = scrubSeoPhrases(part.metaDescription)
  part.bodyMarkdown = scrubLede(part.bodyMarkdown)
  return before !== JSON.stringify([part.title, part.titleOptions, part.slug, part.dek, part.metaDescription, part.bodyMarkdown])
}

const BANNED_ANYWHERE = [/\bnews\s+today\b/i, /\blive\s+match\b/i]

/**
 * QA rule: pasted search phrases in title, dek or lede. Issues contain "stuffing" so qa.ts treats them as blocking.
 * Also flags any "<words> news" phrase that repeats across title, dek and lede.
 */
export function checkSeoStuffing(title: string, dek: string, body: string): string[] {
  const lede = body.split(/\n{2,}/).find((p) => p.trim() && !/^\s*#/.test(p)) ?? ''
  const zones = [title, dek, lede]
  const issues: string[] = []
  for (const re of BANNED_ANYWHERE) {
    const hit = zones.map((z) => z.match(re)?.[0]).find(Boolean)
    if (hit) issues.push(`SEO stuffing: remove the search phrase "${hit}" from the title, dek and first paragraph; write a factual headline`)
  }
  const counts = new Map<string, number>()
  for (const z of zones) {
    const seen = new Set<string>()
    for (const m of z.matchAll(/\b((?:[\p{L}\p{N}'’-]+\s+){1,3})news\b/giu)) {
      const words = m[1]!.trim().toLowerCase().split(/\s+/)
      if (NEWS_OK_BEFORE.has(words[words.length - 1]!)) continue
      seen.add(`${words.join(' ')} news`)
    }
    for (const k of seen) counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  for (const [phrase, n] of counts) {
    if (n >= 2) issues.push(`SEO stuffing: "${phrase}" is repeated in the title, dek and opening paragraph`)
  }
  return issues
}
