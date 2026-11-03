import type { TriageResult } from '@zaviya/shared'

/**
 * ZAV-301: major world stories that Pakistanis follow closely (US-Iran strikes and Hormuz, US elections, Israel-Gaza,
 * the Gulf, big crypto hacks, oil shocks) were rejected for a weak "Pakistan angle" or parked in the review queue.
 * Waleed's rule (4 Nov): these are news, they go out, and the article says what they mean for Pakistan.
 * A match only lifts the Pakistan-relevance score and routes the story as news; QA still checks every fact, and
 * opinion pieces and small foreign entertainment / human-interest items stay out.
 */

export type GlobalTopic = 'us-iran' | 'us-election' | 'israel-gaza' | 'gulf' | 'crypto-hack' | 'oil-shock' | 'us-foreign-policy'

/** Relevance floor for a major global story (the model scores most of them 0.0-0.5 on the Pakistan angle). */
export const MAJOR_GLOBAL_RELEVANCE = 0.7

const ENTERTAINMENT = /\b(netflix|emmy|emmys|oscars?|grammys?|bollywood|hollywood|celebrity|box office|trailer|album|singer|actress|actor|reality show|fashion week|red carpet|royal family|meghan|kardashian)\b/i

const IRAN = /\b(iran\w*|tehran|hormuz|araghchi|qeshm|khamenei|irgc|pickaxe mountain)\b|ایران|ہرمز|تہران/i
const US_STRIKE = /\b(us|u\.s\.|american|pentagon)\b.{0,40}\b(strikes?|airstrikes?|bombs?|bombing|drones?)\b|\b(strikes?|airstrikes?)\b.{0,30}\b(us|u\.s\.|american)\b/i
const US_ELECTION = /\bmid-?terms?\b|\b(us|u\.s\.|american)\b.{0,30}\belections?\b|\belections?\b.{0,40}\b(democrats?|republicans?|congress|senate|trump|white house)\b|\b(democrats?|republicans?)\b.{0,40}\b(congress|senate|house)\b|امریکی\s+(انتخابات|وسط)|مڈٹرم/i
const ISRAEL_GAZA = /\b(gaza|hamas|hezbollah|west bank|israel\w*|idf|netanyahu|palestin\w*)\b|اسرائیل|غزہ|حماس|فلسطین/i
const GULF_PLACE = /\b(saudi\w*|uae|emirates|emirati|qatar\w*|kuwait\w*|bahrain\w*|oman|gcc|gulf|houthis?|yemen\w*|makkah|mecca|riyadh|jeddah|dubai|abu dhabi)\b|سعودی|خلیج/i
const GULF_EVENT = /\b(strikes?|attacks?|drones?|missiles?|intercept\w*|war|ceasefire|killed|airspace|oil|expats?|remittances?|visa|labou?r|workers?|embassy)\b/i
const CRYPTO_ASSET = /\b(binance|bitcoin|crypto\w*|ethereum|coinbase|bybit|wallet|defi|exchange)\b/i
const CRYPTO_HACK = /\b(hack\w*|heist|stolen|exploit\w*|breach\w*|drain\w*|theft)\b/i
const OIL_GLOBAL = /\b(brent|crude|opec|wti|oil prices?|barrels?)\b/i
const OIL_MOVE = /\b(surge\w*|spike\w*|shock|jump\w*|plunge\w*|tumble\w*|soar\w*|cut|hike|supply|output|fears?)\b/i
const TRUMP = /\b(trump)\b|ٹرمپ/i
const TRUMP_FOREIGN = /\b(tariffs?|sanctions?|ceasefire|war|iran\w*|pakistan\w*|india\w*|china|chinese|russia\w*|ukraine|gaza|israel\w*|strikes?|nato|putin|xi|modi|imran|munir|sharif|hormuz)\b/i

/** The major world topic a cluster is about, or null. Headline text only: cheap, no model call. */
export function majorGlobalTopic(...texts: (string | null | undefined)[]): GlobalTopic | null {
  const text = texts.filter((t): t is string => Boolean(t)).join(' \n ')
  if (!text.trim() || ENTERTAINMENT.test(text)) return null
  if (IRAN.test(text) || (US_STRIKE.test(text) && /\b(iran\w*|hormuz|qeshm|yemen\w*|houthis?|gulf)\b/i.test(text))) return 'us-iran'
  if (US_ELECTION.test(text)) return 'us-election'
  if (ISRAEL_GAZA.test(text)) return 'israel-gaza'
  if (GULF_PLACE.test(text) && GULF_EVENT.test(text)) return 'gulf'
  if (CRYPTO_ASSET.test(text) && CRYPTO_HACK.test(text)) return 'crypto-hack'
  if (OIL_GLOBAL.test(text) && OIL_MOVE.test(text)) return 'oil-shock'
  if (TRUMP.test(text) && TRUMP_FOREIGN.test(text)) return 'us-foreign-policy'
  return null
}

/** The model's triage with the global-story adjustments (relevance floor; a plain model reject becomes a review). */
export function applyGlobalTopic(triage: TriageResult, topic: GlobalTopic | null): TriageResult {
  if (!topic) return triage
  const lifted = { ...triage, pakistanRelevance: Math.max(triage.pakistanRelevance, MAJOR_GLOBAL_RELEVANCE) }
  // Opinion never reaches here as news (routeByStoryKind closes it first); a reject on "no Pakistan angle" is reversed
  return lifted.decision === 'reject' && lifted.storyKind !== 'opinion' ? { ...lifted, decision: 'review' } : lifted
}

const TOPIC_LABEL: Record<GlobalTopic, string> = {
  'us-iran': 'the US-Iran conflict',
  'us-election': 'the US elections',
  'israel-gaza': 'the Israel-Gaza war',
  gulf: 'the Gulf region',
  'crypto-hack': 'a major crypto hack',
  'oil-shock': 'a global oil move',
  'us-foreign-policy': 'US foreign policy',
}

/** Extra writer instruction for a major world story: report it, then say in a few lines what it means for Pakistan. */
export function globalTopicBrief(topic: unknown): string {
  if (typeof topic !== 'string' || !(topic in TOPIC_LABEL)) return ''
  return [
    `This is a major world story (${TOPIC_LABEL[topic as GlobalTopic]}) that Pakistani readers follow closely.`,
    'Report what happened, strictly from the sources. In whatItMeans write a short "What it means for Pakistan" section (2-4 sentences):',
    'the likely effect on whichever of these applies (oil and petrol prices, remittances, Gulf jobs, the PSX, the rupee, trade, security),',
    'stated as cautious expectations, never as facts. Do not invent numbers, quotes or events that are not in the sources.',
  ].join(' ')
}
