import type { XPost } from '@zaviya/shared'
import { VIRAL_RULES, VIRAL_SOURCES, type ViralSource } from './viral-config.js'

/**
 * Viral radar, the pure part: score a video post from a known account, decide whether we should amplify it, find our own story
 * about the same event and write the line that goes with it. No network here; viral-radar.ts does the fetching and posting.
 */

export interface Story {
  title: string
  url: string
}

export type ViralDecision =
  | { action: 'post'; score: number; velocity: number; story?: Story }
  | { action: 'skip'; reason: string; score?: number }

const PKT_OFFSET_MS = 5 * 60 * 60_000

export function sourceFor(handle: string, list: ViralSource[] = VIRAL_SOURCES): ViralSource | undefined {
  const h = handle.replace(/^@/, '').toLowerCase()
  return list.find((s) => s.handle.toLowerCase() === h)
}

/** The author handle of a post (the scrape gives it as the first path part of the profile link). */
export function authorHandle(post: Pick<XPost, 'author'>): string {
  return post.author.replace(/^@/, '').split(/[/?#]/)[0] ?? ''
}

export function ageMs(post: Pick<XPost, 'createdAt'>, now: number): number {
  const t = Date.parse(post.createdAt)
  return Number.isFinite(t) ? Math.max(0, now - t) : Number.POSITIVE_INFINITY
}

export function viewsPerHour(post: Pick<XPost, 'views' | 'createdAt'>, now: number): number {
  const hours = Math.max(0.25, ageMs(post, now) / 3_600_000)
  return Math.round((post.views ?? 0) / hours)
}

const KIND_BONUS: Record<ViralSource['kind'], number> = { official: 6, outlet: 5, journalist: 5, celebrity: 3 }

/** 0-100 style score: how big, how fast, how engaged, how trusted the source is, whether it is a video and whether we have a story. */
export function scoreViral(post: XPost, src: ViralSource, now: number, story?: Story): number {
  const views = post.views ?? 0
  const velocity = viewsPerHour(post, now)
  const interactions = (post.likes ?? 0) + (post.reposts ?? 0) * 2 + (post.replies ?? 0)
  const engagement = views > 0 ? Math.min(0.05, interactions / views) : 0
  const ageH = ageMs(post, now) / 3_600_000
  const score =
    Math.log10(views + 1) * 8 + // 100K views = 40
    Math.log10(velocity + 1) * 6 + // 10K per hour = 24
    engagement * 200 + // 2% engagement = 4, capped at 10
    KIND_BONUS[src.kind] +
    (post.hasVideo ? 6 : 0) +
    (story ? 6 : 0) -
    Math.min(8, ageH)
  return Math.round(score * 10) / 10
}

// ---- safety ---------------------------------------------------------------------------------------------------------

/**
 * Not amplified: graphic harm (the video itself would be the story), insults and incitement, spam and promotions, party slogans.
 * Politics and court news are fine (Waleed, 28 Nov): only the nasty or graphic parts are filtered, and a skipped post is never softened.
 */
const BLOCK: { why: string; re: RegExp }[] = [
  { why: 'graphic or tragic footage', re: /\b(dead bod(?:y|ies)|corpses?|mutilated|beheaded|lynch\w*|stabbed|shot dead|massacre|gruesome|graphic|disturbing|killed in|victims?|mourn\w*|funeral|died|death toll|drown\w*|suicide|rape\w*|molest\w*|child abuse|body found)\b/i },
  { why: 'graphic or tragic footage', re: /(لاش|لاشیں|جنازہ|جاں بحق|ہلاک|خودکشی|زیادتی|قتل|مقتول)/ },
  { why: 'insult or incitement', re: /\b(idiot|stupid|moron|traitor|thief|thieves|liar|scum|shameless|terrorist|kill\w*|murder\w*|behead\w*|revenge|riots?|long march|take to the streets)\b/i },
  { why: 'insult or incitement', re: /(چور|غدار|بے شرم|بیشرم|جھوٹا|منافق|ڈاکو|انتقام|فساد|لانگ مارچ)/ },
  { why: 'party slogan', re: /\b(zindabad|murdabad|jiyala|jiyalay|insafian|patwari|youthiya|khan ka|bhutto zinda)\b/i },
  { why: 'promotion or spam', re: /\b(giveaway|follow me|subscribe|link in bio|use code|discount|airdrop|crypto|bitcoin|nft|sponsored|promo|ad\b)/i },
  { why: 'blasphemy or hate topic', re: /\b(blasphem\w*|sacrilege|gustakh\w*|hate speech)\b/i },
]

export function blockReason(text: string): string | null {
  for (const b of BLOCK) if (b.re.test(text)) return b.why
  return null
}

/** Too short to say anything on its own (mostly emojis, a hashtag or a link) */
export function textTooThin(text: string): boolean {
  const words = text.replace(/https?:\/\/\S+|[#@]\S+/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean)
  return words.length < 5
}

// ---- finding our own story -----------------------------------------------------------------------------------------

const STOP = new Set(
  'the and for with that this from have has had was were are not but you your they them their will would could should about after before over into than then there here what when where which while also been being just more most some such only very says said say new news live watch video breaking today latest update after amid'.split(' '),
)

export function keywords(text: string): Set<string> {
  const out = new Set<string>()
  for (const w of text.toLowerCase().replace(/https?:\/\/\S+/g, ' ').split(/[^\p{L}\p{N}]+/u)) {
    if (w.length >= 4 && !STOP.has(w)) out.add(w)
  }
  return out
}

/** The newest-matching story of ours about the same event: at least 2 shared words (3 when the post is long). */
export function matchStory(postText: string, stories: Story[]): Story | undefined {
  const post = keywords(postText)
  const need = post.size >= 12 ? 3 : 2
  let best: { s: Story; n: number } | undefined
  for (const s of stories) {
    let n = 0
    for (const w of keywords(s.title)) if (post.has(w)) n++
    if (n >= need && (!best || n > best.n)) best = { s, n }
  }
  return best?.s
}

// ---- the decision ---------------------------------------------------------------------------------------------------

export function decideViral(
  post: XPost,
  input: { now: number; stories: Story[]; sources?: ViralSource[]; rules?: typeof VIRAL_RULES },
): ViralDecision {
  const rules = input.rules ?? VIRAL_RULES
  const src = sourceFor(authorHandle(post), input.sources)
  if (!src) return { action: 'skip', reason: 'not a watched account' }
  if (!post.id) return { action: 'skip', reason: 'no post id' }
  if (rules.requireVideo && !post.hasVideo) return { action: 'skip', reason: 'no video' }
  const age = ageMs(post, input.now)
  if (age > rules.maxAgeMs) return { action: 'skip', reason: 'older than 8 hours' }
  if (age < rules.minAgeMs) return { action: 'skip', reason: 'too new to judge' }
  if (post.views === undefined) return { action: 'skip', reason: 'view count not visible' }
  const need = src.group === 'pk' ? rules.pk : rules.global
  const velocity = viewsPerHour(post, input.now)
  if (post.views < need.minViews) return { action: 'skip', reason: `views ${post.views} < ${need.minViews}` }
  if (velocity < need.minPerHour) return { action: 'skip', reason: `${velocity} views/h < ${need.minPerHour}` }
  const blocked = blockReason(post.text)
  if (blocked) return { action: 'skip', reason: blocked }
  if (textTooThin(post.text)) return { action: 'skip', reason: 'post text too thin to explain the video' }
  const story = matchStory(post.text, input.stories)
  if (src.group === 'global' && !story) return { action: 'skip', reason: 'global video with no Zaviya story on it' }
  const score = scoreViral(post, src, input.now, story)
  if (score < rules.minScore) return { action: 'skip', reason: `score ${score} < ${rules.minScore}`, score }
  return { action: 'post', score, velocity, story }
}

// ---- the words that go with it ---------------------------------------------------------------------------------------

/** X counts every link as 23 characters */
const LINK_CHARS = 23
const MAX_TWEET = 280

function excerpt(text: string, max: number): string {
  const t = text.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  const sp = cut.lastIndexOf(' ')
  return `${cut.slice(0, sp > max * 0.6 ? sp : max).replace(/[.,;:\s]+$/, '')}…`
}

/** The post URL goes last so X shows the original as a quoted post; our own story link comes before it. */
export function viralCopy(post: XPost, src: ViralSource, story?: Story, utm = 'x'): string {
  const postUrl = `https://x.com/${authorHandle(post)}/status/${post.id}`
  if (story) {
    const link = `${story.url}${story.url.includes('?') ? '&' : '?'}utm_source=${utm}`
    const room = MAX_TWEET - LINK_CHARS * 2 - 4
    return `${excerpt(story.title, room)}\n${link}\n${postUrl}`
  }
  const lead = `Video from ${src.name}: `
  const room = MAX_TWEET - LINK_CHARS - lead.length - 3
  return `${lead}${excerpt(post.text, room)}\n${postUrl}`
}

// ---- daily limits (live mode) ----------------------------------------------------------------------------------------

export function inViralHours(ms: number, rules = VIRAL_RULES): boolean {
  const h = Math.floor((((ms + PKT_OFFSET_MS) % 86_400_000) + 86_400_000) % 86_400_000 / 3_600_000)
  return h >= rules.allowedHours[0] && h < rules.allowedHours[1]
}

export function viralSlot(input: { now: number; postedToday: number; lastPostedAt?: number | null }, rules = VIRAL_RULES): { ok: true } | { ok: false; reason: string } {
  if (!inViralHours(input.now, rules)) return { ok: false, reason: 'quiet hours (00:00-08:00 PKT)' }
  if (input.postedToday >= rules.maxPerDay) return { ok: false, reason: `daily limit reached (${input.postedToday}/${rules.maxPerDay})` }
  if (input.lastPostedAt && input.now - input.lastPostedAt < rules.minGapMs) return { ok: false, reason: 'spacing' }
  return { ok: true }
}

export function pktDayKey(ms: number): string {
  return new Date(ms + PKT_OFFSET_MS).toISOString().slice(0, 10)
}
