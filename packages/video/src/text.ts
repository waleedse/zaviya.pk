const STOP = new Set(['a', 'an', 'the', 'of', 'to', 'in', 'on', 'for', 'and', 'as', 'at', 'by', 'with', 'from'])

function trimEnd(s: string): string {
  let out = s.trim()
  for (;;) {
    const stripped = out.replace(/[\s,;:\-–—.]+$/u, '')
    const m = /(?:^|\s)([A-Za-z]+)$/.exec(stripped)
    if (m && STOP.has(m[1]!.toLowerCase()) && stripped.includes(' ')) {
      out = stripped.slice(0, stripped.length - m[1]!.length)
      continue
    }
    return stripped
  }
}

/** Rule-based headline shortening: cut at a clause boundary or a word boundary, never add an ellipsis. */
export function shortenHeadline(t: string, max = 70, strict = false): string {
  const title = t.trim().replace(/\s+/g, ' ')
  if (title.length <= max) return title
  let best = -1
  for (const sep of [': ', ' — ', ' - ', ', ']) {
    let i = title.lastIndexOf(sep)
    while (i >= 0) {
      if (i >= 30 && i <= max) {
        best = Math.max(best, i)
        break
      }
      i = i > 0 ? title.lastIndexOf(sep, i - 1) : -1
    }
  }
  if (best >= 0) return trimEnd(title.slice(0, best))
  // A short head before a colon ("Pakistan school collapse") reads better than a sentence cut mid-way
  const colon = title.indexOf(': ')
  if (colon >= 16 && colon <= max) return trimEnd(title.slice(0, colon))
  // Slightly long titles stay whole (the headline font steps down) rather than end on a dangling word
  if (!strict && title.length <= Math.round(max * 1.2)) return title
  const sp = title.lastIndexOf(' ', max)
  const cut = sp > 0 ? title.slice(0, sp) : title.slice(0, max)
  return trimEnd(cut)
}

const UNITS = 'bn|m|tr|trillion|billion|million|crore|lakh'
const UNIT_WORDS =
  'percent|per cent|points|runs|wickets|people|deaths|seats|days|hours|years|megawatts|mw|mb|gb|tola|kg|km|acres|students|jobs|units|tonnes|tons'

const FIGURE_PATTERNS: RegExp[] = [
  new RegExp(String.raw`Rs\.?\s?\d[\d,]*(?:\.\d+)?\s?(?:${UNITS})?(?![A-Za-z])`, 'i'),
  new RegExp(String.raw`\$\s?\d[\d,]*(?:\.\d+)?\s?(?:${UNITS})?(?![A-Za-z])`, 'i'),
  /\d[\d,]*(?:\.\d+)?%/,
  new RegExp(String.raw`\b\d[\d,]*(?:\.\d+)?\s?(?:${UNITS}|${UNIT_WORDS})\b`, 'i'),
]

const LABEL_STOP = /[,;:.!?()"“”—–]/

/** First money/number token of a headline (money preferred over percentages) with a short label. */
export function findFigure(t: string, categoryLabel = 'NUMBERS'): { value: string; label: string } | null {
  for (const re of FIGURE_PATTERNS) {
    const m = re.exec(t)
    if (!m) continue
    const value = m[0].trim().replace(/[.,]+$/, '')
    const after = t.slice(m.index + m[0].length)
    const clause = after.split(LABEL_STOP)[0] ?? ''
    const words = clause.split(/\s+/).filter(Boolean)
    const label = words.length >= 2 ? words.slice(0, 4).join(' ').toUpperCase() : categoryLabel.toUpperCase()
    return { value, label }
  }
  return null
}

/** The figure token if any, else the longest capitalised multi-word proper noun not at position 0. */
export function findHighlight(t: string, figure: { value: string } | null = findFigure(t)): string | undefined {
  if (figure) return figure.value
  const re = /\b[A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+)+/g
  let best: string | undefined
  for (const m of t.matchAll(re)) {
    if (m.index === 0) continue
    if (!best || m[0].length > best.length) best = m[0]
  }
  return best
}

const SOMBRE = [
  'killed',
  'kills',
  'dead',
  'dies',
  'died',
  'death',
  'martyr',
  'martyred',
  'blast',
  'bomb',
  'attack',
  'terror',
  'earthquake',
  'flood',
  'floods',
  'crash',
  'injured',
  'wounded',
  'funeral',
  'mourning',
  'shooting',
  'suicide',
]
const SOMBRE_RE = new RegExp(`\\b(?:${SOMBRE.join('|')})\\b`, 'i')

export function isSombre(t: string): boolean {
  return SOMBRE_RE.test(t)
}

/** "via Dawn · Reuters": tier 1-2 sources, de-duplicated, at most 2. */
export function creditLine(sources: { name: string; tier: number }[]): string {
  const names: string[] = []
  for (const s of sources) {
    const n = s.name?.replace(/\([^)]*\)/g, '').replace(/^[\s|·-]+/, '').trim()
    if (!n || s.tier > 2 || /^google news$/i.test(n)) continue
    if (!names.some((x) => x.toLowerCase() === n.toLowerCase())) names.push(n)
    if (names.length === 2) break
  }
  return names.length ? `via ${names.join(' · ')}` : ''
}

export function wordCount(t: string): number {
  return t.split(/\s+/).filter(Boolean).length
}

/** A standfirst cut at a sentence or clause end, never mid-phrase; null when no clean cut fits. */
export function shortenDek(t: string, max = 140): string | null {
  const dek = t.trim().replace(/\s+/g, ' ')
  if (dek.length <= max) return dek
  for (const sep of ['. ', '; ', ', while ', ', but ', ', ']) {
    const i = dek.lastIndexOf(sep, max)
    if (i >= (sep === ". " ? 20 : 60)) return dek.slice(0, i).replace(/[,;:\s]+$/, '') + (sep === '. ' ? '.' : '')
  }
  return null
}
