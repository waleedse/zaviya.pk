import type { TriageResult } from '@zaviya/shared'

/**
 * ZAV-155: opinion pieces and features about events abroad must not go out as Pakistan news.
 * On 21 Oct a Dawn editorial on the Nepal-Tibet glacier collapse (1429) and a second story built on the same text
 * (1430) were published in the Pakistan section as reports. Two layers: the triage model labels the story
 * (storyKind, eventRegion) and plain code backs it up with cues the model can miss.
 */

export const OPINION_REASON = 'opinion or commentary, not a news report'
export const FOREIGN_FEATURE_REASON = 'feature about an event abroad without a strong Pakistan angle'
/** A foreign-event feature needs at least this much Pakistan relevance to run at all (then in World). */
export const FOREIGN_FEATURE_MIN_RELEVANCE = 0.6

const OPINION_PATH = /\/(opinion|opinions|editorial|editorials|op-?ed|column|columns|columnists?|letters?|blogs?|viewpoint|perspective|comment)(\/|$)/i
const OPINION_TITLE_PREFIX = /^\s*(opinion|editorial|column|op-?ed|letters?|view|viewpoint)\s*[:|–—-]\s*\S/i
const OPINION_TITLE_SUFFIX = /\s[|–—-]\s*(opinion|editorial|op-?ed|column)\s*$/i
/** Columnists sign off with a bio line */
const BYLINE = /\b(?:the|this) (?:writer|author|columnist) (?:is|was|has been|works|teaches|heads)\b|\bviews? expressed (?:here )?(?:are|is) (?:those of )?the (?:writer|author)/i
const NORMATIVE = /\b(must|should|ought to|needs? to|has to|have to|need for)\b/gi
const ATTRIBUTION = /\b(said|says|told|according to|announced|reported|stated|confirmed|added|spokesperson|officials?|police|ministry|statement)\b/gi

export interface KindItem {
  title: string
  url?: string
  summary?: string
  contentText?: string
}

/** Short reason when the sources read like opinion or an editorial, otherwise null. Needs no model call. */
export function opinionCue(items: KindItem[]): string | null {
  for (const it of items) {
    let path = ''
    try {
      const u = new URL(it.url ?? '')
      if (!/(^|\.)google\./.test(u.hostname)) path = u.pathname
    } catch {
      /* no usable URL */
    }
    if (path && OPINION_PATH.test(path)) return `${OPINION_REASON} (section in the URL)`
    if (OPINION_TITLE_PREFIX.test(it.title) || OPINION_TITLE_SUFFIX.test(it.title)) return `${OPINION_REASON} (labelled in the headline)`
    const text = (it.contentText ?? '').replace(/\(Read from [^)]*\)/g, ' ')
    if (BYLINE.test(text)) return `${OPINION_REASON} (writer's bio line)`
    // An editorial argues: repeated "must / should / needs to" and nobody is quoted or cited
    if (text.length >= 400 && (text.match(NORMATIVE)?.length ?? 0) >= 3 && (text.match(ATTRIBUTION)?.length ?? 0) === 0) {
      return `${OPINION_REASON} (argues what should be done, quotes no one)`
    }
  }
  return null
}

export type KindVerdict = { action: 'ok'; triage: TriageResult } | { action: 'reject'; reason: string }

/**
 * What the story kind means for the pipeline. Opinion is closed. A feature about an event abroad runs only with a
 * Pakistan angle, and then in World. Any other story about an event abroad leaves the Pakistan section for World.
 */
export function routeByStoryKind(triage: TriageResult, items: KindItem[]): KindVerdict {
  const cue = triage.storyKind === 'opinion' ? OPINION_REASON : opinionCue(items)
  if (cue) return { action: 'reject', reason: cue }
  if (triage.eventRegion === 'abroad') {
    if (triage.storyKind === 'feature' && triage.pakistanRelevance < FOREIGN_FEATURE_MIN_RELEVANCE) {
      return { action: 'reject', reason: FOREIGN_FEATURE_REASON }
    }
    if (triage.category === 'pakistan') return { action: 'ok', triage: { ...triage, category: 'world' } }
  }
  return { action: 'ok', triage }
}

/** Outlet host -> a word that the outlet's name in a headline suffix ("... - Dawn") must contain. */
const OUTLET_HOSTS: Record<string, string> = {
  'dawn.com': 'dawn',
  'geo.tv': 'geo',
  'thenews.com.pk': 'news',
  'tribune.com.pk': 'tribune',
  'brecorder.com': 'recorder',
  'aaj.tv': 'aaj',
  'samaa.tv': 'samaa',
  'arynews.tv': 'ary',
  'arabnews.pk': 'arab',
  'arabnews.com': 'arab',
  'propakistani.pk': 'propakistani',
  'reuters.com': 'reuters',
  'bbc.com': 'bbc',
  'aljazeera.com': 'jazeera',
  'nikkei.com': 'nikkei',
  'asia.nikkei.com': 'nikkei',
}

/**
 * True when text read through the extension came from another known outlet than the one the headline names.
 * Cluster 10902 ("Pakistan warms to Russia ... - Nikkei Asia") was filled with a Dawn editorial this way, and
 * the writer then produced a glacier story under the wrong source (1430).
 */
export function pageFromWrongOutlet(itemTitle: string, pageUrl: string): boolean {
  const m = / [-–|] ([^-–|]{2,40})$/.exec(itemTitle.trim())
  if (!m) return false
  const expected = m[1]!.toLowerCase()
  let host: string
  try {
    host = new URL(pageUrl).hostname.toLowerCase().replace(/^(www|m|amp)\./, '')
  } catch {
    return false
  }
  const known = Object.keys(OUTLET_HOSTS).find((h) => host === h || host.endsWith(`.${h}`))
  if (!known) return false
  return !expected.includes(OUTLET_HOSTS[known]!)
}
