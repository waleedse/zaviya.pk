/** Headline-only: "What happens next" is a normal body subheading, not clickbait. */
const BANNED_PATTERNS = [
  /\b(shocking|you won'?t believe|what happens next)\b/i,
  /\b(breaking\s+breaking)\b/i,
  /!{3,}/,
]

/** Direct quotes must match the source word for word, so they don't count as copying. */
export function stripQuotes(text: string): string {
  return text.replace(/["“”][^"“”]{0,600}["“”]/g, ' ').replace(/(^|\s)'[^']{10,400}'(?=\s|[.,;:]|$)/g, ' ')
}

const CLICKBAIT = [/\b(one weird trick|doctors hate)\b/i]

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

export function ngrams(text: string, n: number): Set<string> {
  const tokens = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean)
  const set = new Set<string>()
  for (let i = 0; i <= tokens.length - n; i++) {
    set.add(tokens.slice(i, i + n).join(' '))
  }
  return set
}

export function ngramOverlapRatio(a: string, b: string, n = 5): number {
  const A = ngrams(a, n)
  const B = ngrams(b, n)
  if (A.size === 0 || B.size === 0) return 0
  let inter = 0
  for (const g of A) if (B.has(g)) inter++
  return inter / A.size
}

export function checkOriginality(body: string, sources: string[], maxRatio = 0.2): string[] {
  const issues: string[] = []
  for (const src of sources) {
    const ratio = ngramOverlapRatio(stripQuotes(body), src)
    if (ratio >= maxRatio) {
      issues.push(`5-gram overlap ${(ratio * 100).toFixed(1)}% with a source (max ${maxRatio * 100}%)`)
    }
  }
  return issues
}

export function checkLength(body: string, priority: 'normal' | 'high' | 'breaking'): string[] {
  const wc = wordCount(body)
  if (priority === 'breaking') {
    if (wc < 150) return [`Breaking story too short (${wc} words, min 150)`]
    return []
  }
  // Short, well-sourced reports (match results, notifications) are fine; padding to hit a count is not.
  if (wc < 180 || wc > 1000) {
    return [`Body length ${wc} words (expected 180–1000)`]
  }
  return []
}

export function checkBannedAndClickbait(title: string, body: string): string[] {
  const issues: string[] = []
  if (title === title.toUpperCase() && /[A-Z]/.test(title)) {
    issues.push('Title is all caps')
  }
  for (const p of BANNED_PATTERNS) {
    if (p.test(title)) issues.push(`Banned pattern in title: ${p}`)
  }
  if (/!{3,}/.test(body)) issues.push('Body uses "!!!"')
  for (const p of CLICKBAIT) {
    if (p.test(title)) issues.push(`Clickbait pattern in title: ${p}`)
  }
  return issues
}

/** Urdu script (Arabic block) ratio among letters. */
export function urduScriptRatio(text: string): number {
  const letters = text.match(/[\p{L}]/gu) ?? []
  if (letters.length === 0) return 0
  const urdu = text.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/gu) ?? []
  return urdu.length / letters.length
}

export function checkUrduLocale(body: string, minRatio = 0.85): string[] {
  const ratio = urduScriptRatio(body)
  if (ratio < minRatio) {
    return [`Urdu script ratio ${(ratio * 100).toFixed(1)}% (min ${minRatio * 100}%)`]
  }
  const englishSentence = /[A-Za-z]{4,}[^.\u0600-\u06FF]{0,20}\./.test(body)
  if (englishSentence) {
    return ['English sentence detected in Urdu body']
  }
  return []
}

export function extractUrls(markdown: string): string[] {
  const urls = new Set<string>()
  const linkRe = /\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g
  const bareRe = /https?:\/\/[^\s)\]"']+/g
  let m: RegExpExecArray | null
  while ((m = linkRe.exec(markdown))) urls.add(m[2]!)
  for (const u of markdown.match(bareRe) ?? []) urls.add(u.replace(/[.,]+$/, ''))
  return [...urls]
}

const FAQ_COMMON = new Set(['pakistan', 'pakistani', 'pakistanis', 'karachi', 'lahore', 'islamabad', 'urdu', 'english', 'roman', 'rupees', 'zaviya'])

/** Names and numbers a FAQ question asks about: capitalised words after the first word, and digit runs. */
export function faqQuestionTerms(question: string): string[] {
  const words = question.replace(/[?؟]/g, ' ').split(/\s+/).filter(Boolean)
  const terms: string[] = []
  words.forEach((raw, i) => {
    const w = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').replace(/['’]s$/i, '')
    if (!w) return
    if (/\d/.test(w)) terms.push(w.replace(/[,]/g, ''))
    else if (i > 0 && /^\p{Lu}/u.test(w) && w.length >= 3 && !FAQ_COMMON.has(w.toLowerCase())) terms.push(w)
  })
  return terms
}

/**
 * ZAV-200: the FAQ must only ask about things the sources contain. The writer once added "Did Arshad Nadeem withdraw
 * from a Switzerland event?" to a javelin story that never mentioned Switzerland. A question that names a person,
 * place or number that is absent from every source is dropped (the others stay).
 */
export function dropUnsupportedFaqs<T extends { q: string }>(faqs: T[], sourceText: string): { kept: T[]; dropped: T[] } {
  const hay = sourceText.toLowerCase().replace(/,/g, '')
  const kept: T[] = []
  const dropped: T[] = []
  for (const f of faqs) {
    const missing = faqQuestionTerms(f.q).filter((t) => !hay.includes(t.toLowerCase()))
    ;(missing.length ? dropped : kept).push(f)
  }
  return { kept, dropped }
}
