import type { WorkerEnv } from '../config.js'
import type { PayloadClient } from '../payload-client.js'
import { logger } from '../logger.js'

/**
 * ZAV-111 / ZAV-132: friendly replies to comments on our own Facebook and Instagram posts.
 * Fixed templates (no model call), chosen by the comment's sentiment, never the same one twice in a row,
 * one reply per comment, at most 20 a day. Spam is hidden on Facebook; abuse and politics are left alone.
 */

export type Sentiment = 'question' | 'praise' | 'negative' | 'neutral'
type FetchFn = typeof fetch

/** The slice of Redis this needs, so tests can use a Map */
export type KV = {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<unknown>
  /** Sets the key with an expiry only if it is not there yet; true when this call set it */
  setNx(key: string, value: string, ttlSeconds: number): Promise<boolean>
  incr(key: string): Promise<number>
  expire(key: string, seconds: number): Promise<unknown>
}

const GRAPH = 'https://graph.facebook.com/v21.0'
export const MAX_REPLIES_PER_DAY = 20
export const MAX_REPLIES_PER_RUN = 8

/** 10 templates: [English, Urdu] */
export const TEMPLATES: Record<Sentiment, [string, string][]> = {
  question: [
    ['Good question! The full story has the details, the link is in our first comment.', 'اچھا سوال! تفصیل مکمل خبر میں ہے، لنک ہمارے پہلے کمنٹ میں ہے۔'],
    ['Thanks for asking. We will keep updating the story as we learn more, so do follow our page.', 'پوچھنے کا شکریہ۔ نئی معلومات آتے ہی خبر اپڈیٹ کرتے رہیں گے، ہمارا پیج فالو کیجیے۔'],
    ['Fair question. Check the article on zaviya.pk for what we know so far.', 'اچھا سوال ہے۔ اب تک کی معلومات zaviya.pk پر خبر میں دیکھیں۔'],
  ],
  praise: [
    ['Thank you for the kind words! We are glad it helped.', 'حوصلہ افزائی کا شکریہ! خوشی ہوئی کہ یہ مفید رہا۔'],
    ['Thanks for reading Zaviya News, it means a lot.', 'زاویہ نیوز پڑھنے کا شکریہ، ہمارے لیے بہت اہم ہے۔'],
    ['Much appreciated! More stories like this on zaviya.pk every day.', 'بہت شکریہ! ایسی مزید خبریں روزانہ zaviya.pk پر۔'],
  ],
  negative: [
    ['Thanks for telling us. If we got a fact wrong, please write to corrections@zaviya.pk and we will check it.', 'بتانے کا شکریہ۔ اگر کوئی غلطی ہو تو corrections@zaviya.pk پر لکھیں، ہم جانچ کریں گے۔'],
    ['We hear you. Every story links its sources so you can judge for yourself.', 'ہم آپ کی بات سمجھتے ہیں۔ ہر خبر میں ذرائع کا لنک ہوتا ہے تاکہ آپ خود فیصلہ کر سکیں۔'],
  ],
  neutral: [
    ['Thanks for your comment! Follow us for more news from Pakistan.', 'کمنٹ کا شکریہ! پاکستان کی مزید خبروں کے لیے ہمیں فالو کریں۔'],
    ['Thanks for joining the conversation. What do you think about this story?', 'گفتگو میں شامل ہونے کا شکریہ۔ آپ اس خبر کے بارے میں کیا سوچتے ہیں؟'],
  ],
}

const URDU_SCRIPT = /[؀-ۿ]/
const URL_RE = /https?:\/\/|www\.|\b[\w-]+\.(?:com|net|org|pk|info|xyz|me|ly|co)\b|t\.me\/|wa\.me\//i
const SPAM_RE = /\b(follow\s*back|f4f|dm\s*me|whats\s*app\s*me|earn\s+\$?\d+|make\s+money|free\s+(?:followers|gift|crypto)|crypto|forex|investment\s+plan|click\s+(?:here|link)|promo\s*code)\b/i
const ABUSE_RE = /\b(fuck\w*|bitch\w*|bastard|asshole|shit|idiot|stupid|dog|pig|gandu|harami|kutta|kutte|bakwas\s+log|chutiya\w*|madarchod|bhenchod|lanat)\b|حرامی|کتا|کتے|گدھا|بکواس|لعنت/i
const POLITICS_RE = /\b(imran\s*khan|nawaz|shehbaz|zardari|bilawal|maryam|pti|pmln|pml-?n|ppp|mqm|tlp|establishment|army\s+chief|fake\s+government|selected|puppet|traitor|ghaddar|jiye|zindabad|murdabad)\b|عمران|نواز|شہباز|زرداری|بلاول|پی ٹی آئی|غدار|زندہ باد|مردہ باد/i
const QUESTION_RE = /\?|؟|\b(why|how|when|where|what|which|who|kya|kyun|kyu|kab|kaise|kaha|kahan|kitna|kitne|kon|kaun)\b|کیا|کیوں|کب|کیسے|کہاں|کتنا|کتنے|کون/i
const PRAISE_RE = /\b(thanks?|thank\s*you|great|good|nice|excellent|well\s*done|informative|helpful|love|mashallah|masha\s*allah|jazak\w*|shukriya|zabardast|acha|achha|best|amazing)\b|شکریہ|بہت\s*خوب|ماشاء\s*اللہ|زبردست|اچھا|جزاک/i
const NEGATIVE_RE = /\b(fake|false|lie|lies|wrong|misleading|biased|nonsense|rubbish|useless|jhoot|jhooti|ghalat|bad|worst|shame|disappointed|clickbait)\b|جھوٹ|غلط|فیک|شرم|بدترین/i

export type Verdict = { action: 'reply'; sentiment: Sentiment; urdu: boolean } | { action: 'hide' } | { action: 'skip'; reason: string }

/** Decides what to do with one comment */
export function classifyComment(text: string): Verdict {
  const t = text.trim()
  if (t.length < 2) return { action: 'skip', reason: 'empty' }
  if (URL_RE.test(t) || SPAM_RE.test(t) || /(.)\1{9,}/.test(t)) return { action: 'hide' }
  if (ABUSE_RE.test(t)) return { action: 'skip', reason: 'abuse' }
  if (POLITICS_RE.test(t)) return { action: 'skip', reason: 'politics' }
  const urdu = URDU_SCRIPT.test(t)
  const sentiment: Sentiment = NEGATIVE_RE.test(t) ? 'negative' : QUESTION_RE.test(t) ? 'question' : PRAISE_RE.test(t) ? 'praise' : 'neutral'
  return { action: 'reply', sentiment, urdu }
}

/** A template for the sentiment that is not the one used last time (it is stored by text, so edits to the list stay safe) */
export function pickReply(sentiment: Sentiment, urdu: boolean, lastText: string | null, rnd: () => number = Math.random): string {
  const list = TEMPLATES[sentiment]
  const idx = urdu ? 1 : 0
  const options = list.filter((tpl) => tpl[idx] !== lastText)
  const pool = options.length ? options : list
  return pool[Math.floor(rnd() * pool.length)]![idx]
}

type Comment = { id: string; text: string; fromId?: string; createdAt: number }
type Surface = 'facebook' | 'instagram'

async function getJson(fetchFn: FetchFn, url: string, init?: RequestInit): Promise<{ ok: boolean; body: any }> {
  const res = await fetchFn(url, { ...init, signal: AbortSignal.timeout(20_000) })
  return { ok: res.ok, body: await res.json().catch(() => ({})) }
}

const errText = (body: any) => String(body?.error?.message ?? 'request failed').slice(0, 160)

async function fetchComments(surface: Surface, postId: string, token: string, fetchFn: FetchFn): Promise<{ comments: Comment[]; error?: string }> {
  const fields = surface === 'facebook' ? 'id,message,from,created_time' : 'id,text,username,timestamp'
  const filter = surface === 'facebook' ? '&filter=toplevel&order=reverse_chronological' : ''
  const r = await getJson(fetchFn, `${GRAPH}/${postId}/comments?fields=${fields}&limit=50${filter}&access_token=${encodeURIComponent(token)}`)
  if (!r.ok) return { comments: [], error: errText(r.body) }
  const comments: Comment[] = (r.body.data ?? []).map((c: any) => ({
    id: String(c.id),
    text: String(c.message ?? c.text ?? ''),
    fromId: c.from?.id ? String(c.from.id) : c.username ? `ig:${c.username}` : undefined,
    createdAt: Date.parse(String(c.created_time ?? c.timestamp ?? '').replace(/([+-]\d{2})(\d{2})$/, '$1:$2')),
  }))
  return { comments }
}

const pktDate = (now: number) => new Date(now + 5 * 3_600_000).toISOString().slice(0, 10)

/** Every 30 min: reply to new comments on our posts of the last 48 h. */
export async function runCommentReplies(deps: {
  env: WorkerEnv
  payload: PayloadClient
  kv: KV
  fetchFn?: FetchFn
  now?: number
  rnd?: () => number
}) {
  const { env, payload, kv } = deps
  const fetchFn = deps.fetchFn ?? fetch
  const now = deps.now ?? Date.now()
  const out = { replied: 0, hidden: 0, skipped: 0, errors: 0, limit: false }
  const token = env.META_PAGE_TOKEN
  if (!env.COMMENT_REPLIES || !token) return { ...out, disabled: true }

  const dayKey = `commentreplies:count:${pktDate(now)}`
  const used = Number((await kv.get(dayKey)) ?? 0)
  let budget = Math.min(MAX_REPLIES_PER_RUN, MAX_REPLIES_PER_DAY - used)
  if (budget <= 0) return { ...out, limit: true }

  const { posts } = await payload.getRecentSocialPosts50h()
  const mine = new Set([env.META_PAGE_ID, env.IG_USER_ID].filter(Boolean).map(String))
  const surfaces = posts.filter((p) => (p.platform === 'facebook' || p.platform === 'instagram') && p.externalId)
  const seenErrors = new Set<string>()

  for (const post of surfaces) {
    if (budget <= 0) break
    const surface = post.platform as Surface
    const { comments, error } = await fetchComments(surface, post.externalId, token, fetchFn)
    if (error) {
      out.errors++
      if (!seenErrors.has(error)) {
        seenErrors.add(error)
        logger.warn({ platform: surface, error }, 'comment replies: could not read comments (token permission?)')
      }
      continue
    }
    for (const c of comments.sort((a, b) => a.createdAt - b.createdAt)) {
      if (budget <= 0) break
      if (!(now - c.createdAt <= 48 * 3_600_000)) continue
      if (c.fromId && mine.has(c.fromId)) continue
      // claim the comment first: at most one reply per comment, even if the job runs twice
      const claimed = await kv.setNx(`commentreplies:done:${c.id}`, String(now), 4 * 86_400)
      if (!claimed) continue
      const verdict = classifyComment(c.text)
      if (verdict.action === 'skip') {
        out.skipped++
        logger.info({ platform: surface, commentId: c.id, reason: verdict.reason }, 'comment reply skipped')
        continue
      }
      try {
        if (verdict.action === 'hide') {
          if (surface === 'facebook') {
            await getJson(fetchFn, `${GRAPH}/${c.id}`, { method: 'POST', body: new URLSearchParams({ is_hidden: 'true', access_token: token }) })
          }
          out.hidden++
          logger.info({ platform: surface, commentId: c.id }, 'spam comment hidden')
          continue
        }
        const lastKey = `commentreplies:last:${surface}`
        const text = pickReply(verdict.sentiment, verdict.urdu, await kv.get(lastKey), deps.rnd)
        const endpoint = surface === 'facebook' ? `${GRAPH}/${c.id}/comments` : `${GRAPH}/${c.id}/replies`
        const r = await getJson(fetchFn, endpoint, { method: 'POST', body: new URLSearchParams({ message: text, access_token: token }) })
        if (!r.ok) {
          out.errors++
          logger.warn({ platform: surface, commentId: c.id, error: errText(r.body) }, 'comment reply failed')
          continue
        }
        await kv.set(lastKey, text)
        budget--
        out.replied++
        const n = await kv.incr(dayKey)
        if (n === 1) await kv.expire(dayKey, 2 * 86_400)
        logger.info({ platform: surface, commentId: c.id, sentiment: verdict.sentiment, reply: text }, 'comment replied')
      } catch (e) {
        out.errors++
        logger.warn({ err: e, commentId: c.id }, 'comment reply failed')
      }
    }
  }
  return out
}

/** Redis as a KV */
export function redisKv(redis: { get(k: string): Promise<string | null>; set(...a: any[]): Promise<unknown>; incr(k: string): Promise<number>; expire(k: string, s: number): Promise<unknown> }): KV {
  return {
    get: (k) => redis.get(k),
    set: (k, v) => redis.set(k, v),
    setNx: async (k, v, ttl) => (await redis.set(k, v, 'EX', ttl, 'NX')) === 'OK',
    incr: (k) => redis.incr(k),
    expire: (k, s) => redis.expire(k, s),
  }
}
