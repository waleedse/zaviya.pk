const BANNED_PATTERNS = [
  /\b(shocking|you won'?t believe|what happens next)\b/i,
  /\b(breaking\s+breaking)\b/i,
  /!{3,}/,
]

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

export function checkOriginality(body: string, sources: string[], maxRatio = 0.12): string[] {
  const issues: string[] = []
  for (const src of sources) {
    const ratio = ngramOverlapRatio(body, src)
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
  if (wc < 450 || wc > 900) {
    return [`Body length ${wc} words (expected 450–900 for normal/high)`]
  }
  return []
}

export function checkBannedAndClickbait(title: string, body: string): string[] {
  const issues: string[] = []
  if (title === title.toUpperCase() && /[A-Z]/.test(title)) {
    issues.push('Title is all caps')
  }
  for (const p of BANNED_PATTERNS) {
    if (p.test(title) || p.test(body)) issues.push(`Banned pattern: ${p}`)
  }
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
