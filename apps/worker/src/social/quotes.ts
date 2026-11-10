import { createHash } from 'node:crypto'
import type { XPost } from '@zaviya/shared'
import { QUOTE_RULES, type Personality } from './quote-config.js'

/**
 * Quote-card rules in pure functions: what counts as a quote, whether it is safe to post, whether it is verbatim,
 * when a card may go out. Nothing here talks to the network.
 */

export interface QuoteCandidate {
  /** Exactly as said, without the quote marks */
  quote: string
  speaker: string
  role: string
  /** Wikipedia title for the photo lookup */
  wiki: string
  lang: 'en' | 'ur'
  /** The original post or article: kept as the source */
  sourceUrl: string
  /** "@handle on X" or the outlet name */
  sourceLabel: string
  /** When it was said or published (ISO) */
  at: string
  category: string
  /** Zaviya story about it, when there is one */
  articleUrl?: string
  /** Higher goes first */
  score: number
}

// ---- verbatim -------------------------------------------------------------------------------------------------------

/** Quote marks and spaces unified, so a curly apostrophe in the source does not fail the check */
export function normalizeText(s: string): string {
  return s
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** The quote text appears in the source word for word (case and spacing aside). Never a paraphrase. */
export function isVerbatim(quote: string, source: string): boolean {
  const q = normalizeText(quote)
  return q.length > 0 && normalizeText(source).includes(q)
}

// ---- safety ---------------------------------------------------------------------------------------------------------

/**
 * No insults, attacks on people, the army, religion, incitement or party-political attacks. A deliberately blunt filter:
 * a quote that mentions any of these is skipped, never softened.
 */
const UNSAFE: { why: string; re: RegExp }[] = [
  { why: 'insult', re: /\b(idiot|stupid|moron|fool|clown|puppet|traitor|corrupt|thief|thieves|liar|liars|fraud|crook|coward|scum|dog|dogs|pig|shameless|disgrace|criminal|terrorist|loser|dumb|ugly|hate)\b/i },
  { why: 'insult', re: /(چور|غدار|بے شرم|بیشرم|گدھا|کتا|کتے|جھوٹا|بزدل|منافق|ڈاکو|کرپٹ|بدمعاش|احمق|نفرت)/ },
  { why: 'army', re: /\b(army|armed forces|military|ispr|isi|generals?|corps commander|field marshal|establishment|martial law|cantonment)\b/i },
  { why: 'army', re: /(فوج|فوجی|آرمی|عسکری|اسٹیبلشمنٹ|جرنیل|جنرل|آئی ایس آئی|مارشل لا)/ },
  { why: 'religion', re: /\b(islam\w*|muslims?|quran|koran|allah|prophet|blasphem\w*|sectarian|shia|sunni|ahmadi\w*|kafir|jihad\w*|hindu\w*|christian\w*|church|mosque|temple|fatwa|haram|halal|religio\w*|god)\b/i },
  { why: 'religion', re: /(اسلام|مسلم|قرآن|قران|اللہ|رسول|نبی|توہین|فرقہ|شیعہ|سنی|احمدی|کافر|جہاد|ہندو|مسیحی|مسجد|مندر|گرجا|فتویٰ|حرام|حلال|مذہب|خدا)/ },
  { why: 'incitement', re: /\b(kill\w*|murder\w*|shoot\w*|hang|behead\w*|burn\w*|bomb\w*|blood|revenge|riots?|uprising|rise up|take to the streets|long march|lynch\w*|destroy them|wipe out|nuke|nuclear strike)\b/i },
  { why: 'incitement', re: /(قتل|مار ڈال|پھانسی|جلا|بم |خون|بغاوت|دھرنا|لانگ مارچ|انتقام|فساد)/ },
  { why: 'party-political', re: /\b(pti|pml-?n|pml-?q|ppp|tlp|mqm|jui-?f?|anp|bjp|congress party|democrats?|republicans?|maga|labour|tories|conservatives|opposition|regime|rigged|rigging|election fraud|vote theft|imran khan|nawaz sharif|zardari|bilawal)\b/i },
  { why: 'party-political', re: /(تحریک انصاف|پی ٹی آئی|مسلم لیگ|پیپلز پارٹی|ایم کیو ایم|جے یو آئی|اپوزیشن|دھاندلی|عمران خان|نواز شریف|زرداری|بلاول)/ },
  { why: 'attack', re: /\b(blame[sd]?|accus\w+|shame on|resign now|must resign|step down|failed|failure of|should be jailed|jail him|arrest him)\b/i },
  { why: 'spam', re: /\b(giveaway|retweet|follow me|subscribe|link in bio|use code|discount code|airdrop|crypto|bitcoin|token|nft)\b/i },
]

/** Why a quote must not go out, or null when it is fine. */
export function unsafeReason(text: string): string | null {
  for (const u of UNSAFE) if (u.re.test(text)) return u.why
  return null
}

// ---- direct quotes in articles --------------------------------------------------------------------------------------

const NAME = "[A-Z][\\w.'’-]+(?:\\s+(?:[A-Z][\\w.'’-]+|bin|al|ibn|de|van|von)){1,3}"
const VERB = '(?:said|says|told [^.“"]{0,40}?|added|stated|wrote|tweeted|posted|declared|warned|announced|insisted|noted|explained|argued|stressed|vowed|promised)'
const MARKS = '[“"]([^”"]{40,300}?)[,.!?]?[”"]'

export interface DirectQuote {
  quote: string
  speaker: string
  /** Role named right after the speaker ("Sam Altman, chief executive of OpenAI, said"), else '' */
  role: string
}

function cleanRole(raw: string | undefined): string {
  const r = (raw ?? '').replace(/\s+/g, ' ').trim().replace(/^(the|a|an)\s+/i, (m) => m)
  return /^(the |a |an )?(chief|ceo|cfo|president|prime|vice|minister|governor|chairman|chair|secretary|spokes|director|head|founder|captain|coach|actor|actress|singer|cricketer|journalist|senator|speaker|mayor|ambassador)/i.test(r) && r.length <= 70
    ? r.charAt(0).toUpperCase() + r.slice(1)
    : ''
}

/** Text inside quotation marks with a named speaker next to it ("...," said Name / Name said, "..."). The quote is copied as written. */
export function extractDirectQuotes(text: string): DirectQuote[] {
  const out: DirectQuote[] = []
  const src = text.replace(/\s+/g, ' ')
  const seen = new Set<string>()
  const push = (quote: string, speaker: string, role: string) => {
    const q = quote.trim()
    const words = q.split(/\s+/).length
    if (words < 8 || /https?:\/\/|#[\p{L}\p{N}]/u.test(q) || seen.has(q) || !isVerbatim(q, src)) return
    // a statement, not a scare-quoted term: it starts like a sentence
    if (!/^[A-Z0-9؀-ۿ"'“]/.test(q)) return
    seen.add(q)
    out.push({ quote: q, speaker: speaker.trim(), role })
  }
  // "Quote," said Name[, role,]
  const after = new RegExp(`${MARKS}\\s*(?:,\\s*)?(${NAME})\\s+${VERB}\\b|${MARKS}\\s*,?\\s*${VERB}\\s+(${NAME})(?:,\\s*([^,.“"]{4,80}?)[,.])?`, 'g')
  for (const m of src.matchAll(after)) {
    if (m[1] && m[2]) push(m[1], m[2], '')
    else if (m[3] && m[4]) push(m[3], m[4], cleanRole(m[5]))
  }
  // Name said[,:] "Quote"
  const before = new RegExp(`(${NAME})(?:,\\s*([^,.“"]{4,80}?),)?\\s+${VERB}\\s*[,:]?\\s*${MARKS}`, 'g')
  for (const m of src.matchAll(before)) if (m[1] && m[3]) push(m[3], m[1], cleanRole(m[2]))
  return out
}

// ---- X posts of the watch-list --------------------------------------------------------------------------------------

const URDU = /[؀-ۿ]/g
function langOf(text: string): 'ur' | 'en' {
  const letters = text.replace(/[^\p{L}]/gu, '').length || 1
  return (text.match(URDU)?.length ?? 0) / letters > 0.4 ? 'ur' : 'en'
}

/**
 * A watch-listed person's own post as a quote card candidate: their post, word for word, nothing else. Replies, retweets,
 * posts with a link or a photo that carries the point, and posts that are too short or too long are not quotes.
 */
export function quoteFromXPost(post: XPost, who: Personality, now = Date.now()): QuoteCandidate | null {
  if (post.author.toLowerCase() !== who.handle.toLowerCase()) return null
  const age = now - Date.parse(post.createdAt)
  if (!Number.isFinite(age) || age > QUOTE_RULES.maxAgeMs || age < -5 * 60_000) return null
  let text = post.text.trim()
  if (/^(RT @|@)/.test(text)) return null
  // a link at the end is trimmed away; a link inside the text means the post is about the link
  text = text.replace(/\s*https?:\/\/\S+\s*$/g, '').trim()
  if (/https?:\/\//.test(text)) return null
  if (text.length < QUOTE_RULES.minChars || text.length > QUOTE_RULES.maxChars) return null
  // hashtags and handles belong to the post, not to a quote: the caption code must never have to touch the words
  if (/#[\p{L}\p{N}_]/u.test(text) || (text.match(/@\w+/g) ?? []).length > 1) return null
  if (text.split(/\s+/).length < 8) return null
  if (!isVerbatim(text, post.text)) return null
  return {
    quote: text,
    speaker: who.name,
    role: who.role,
    wiki: who.wiki,
    lang: langOf(text),
    sourceUrl: post.url || `https://x.com/${post.author}/status/${post.id}`,
    sourceLabel: `@${who.handle} on X`,
    at: post.createdAt,
    category: who.category ?? 'world',
    score: (who.group === 'pk' ? 2 : 1) + Math.min(1, text.length / 200),
  }
}

// ---- ids, caps, timing ----------------------------------------------------------------------------------------------

/** One quote, one id: the same words by the same person are posted once, wherever they were found. */
export function quoteId(speaker: string, quote: string): string {
  return createHash('sha1').update(`${normalizeText(speaker)}|${normalizeText(quote).replace(/[^\p{L}\p{N}]+/gu, ' ').trim()}`).digest('hex').slice(0, 20)
}

const PKT_OFFSET_MS = 5 * 60 * 60_000
const pktHour = (ms: number) => Math.floor((((ms + PKT_OFFSET_MS) % 86_400_000) + 86_400_000) % 86_400_000 / 3_600_000)

/** PKT calendar day as 2026-11-11, the key of the daily counter */
export function pktDay(ms: number): string {
  return new Date(ms + PKT_OFFSET_MS).toISOString().slice(0, 10)
}

export function inQuoteHours(ms: number): boolean {
  const h = pktHour(ms)
  return h >= QUOTE_RULES.allowedHours[0] && h < QUOTE_RULES.allowedHours[1]
}

/** The first moment at or after `ms` that is inside the allowed hours (08:00 PKT when it is the small hours) */
export function nextQuoteHour(ms: number): number {
  if (inQuoteHours(ms)) return ms
  const base = Math.floor(ms / 3_600_000) * 3_600_000
  for (let step = 1; step <= 24; step++) if (inQuoteHours(base + step * 3_600_000)) return base + step * 3_600_000
  return ms
}

export type QuoteSlot = { action: 'post' } | { action: 'skip'; reason: string } | { action: 'delay'; until: number; reason: string }

/** Max 6 a day, at least 60 minutes apart, nothing from 00:00 to 08:00 PKT. */
export function decideQuoteSlot(input: { now: number; postedToday: number; lastPostedAt?: number | null }): QuoteSlot {
  if (input.postedToday >= QUOTE_RULES.maxPerDay) return { action: 'skip', reason: `quote card cap reached (${input.postedToday}/${QUOTE_RULES.maxPerDay})` }
  let at = input.now
  let reason = ''
  if (input.lastPostedAt && input.lastPostedAt + QUOTE_RULES.minGapMs > at) {
    at = input.lastPostedAt + QUOTE_RULES.minGapMs
    reason = 'spacing'
  }
  if (!inQuoteHours(at)) {
    at = nextQuoteHour(at)
    reason = 'quiet hours (00:00-08:00 PKT)'
  }
  return at <= input.now ? { action: 'post' } : { action: 'delay', until: at, reason }
}

// ---- caption --------------------------------------------------------------------------------------------------------

/**
 * Copy per platform. The quote itself is on the card; the caption names who said it and where it comes from. The quote is
 * only put in the text when it fits whole (never cut inside quote marks). A Zaviya story link goes in when there is one.
 */
export function quoteCopy(c: Pick<QuoteCandidate, 'quote' | 'speaker' | 'role' | 'sourceLabel' | 'sourceUrl' | 'articleUrl'>): { facebook: string; instagram: string; x: string } {
  const who = c.role ? `${c.speaker}, ${c.role}` : c.speaker
  const said = `“${c.quote}”`
  const body = `${said}\n\n${who}\nSource: ${c.sourceLabel}`
  const xShort = `${c.speaker}: ${said}\nSource: ${c.sourceLabel}`
  // X: 280 characters, a link counts 23; leave room for the tags
  const x = xShort.length <= 225 ? xShort : `${c.speaker} in their own words.\nSource: ${c.sourceLabel}`
  // With no Zaviya story to link, the Facebook and Instagram captions carry the original source link
  const withSource = c.articleUrl ? body : `${body}\n${c.sourceUrl}`
  return { facebook: withSource, instagram: withSource, x }
}
