import { logger } from '../logger.js'
import { licenceOk, namedIn, type RealPhoto } from './real-photo.js'
import { topicSubjects } from './photo-topics.js'

/**
 * Last check before a photo goes on a social card: the photo's subject is named in the headline (or the quote), the licence
 * is free, and the size and shape are fine. A failed check is logged as 'social photo rejected' with the reason, so the
 * 3-hourly review can audit it; the caller then tries the next candidate.
 */
export const QA_MIN_WIDTH = 600
export const QA_MIN_ASPECT = 0.45
export const QA_MAX_ASPECT = 3

export type PhotoVerdict = { ok: true } | { ok: false; reason: string }

export function photoQa(photo: Pick<RealPhoto, 'meta' | 'bytes'>, text: string): PhotoVerdict {
  const m = photo.meta
  if (!m.subject) return { ok: false, reason: 'no subject recorded for the photo' }
  // named in the headline/quote, or a topic place the headline maps to (Congress -> the Capitol)
  const named = namedIn(text, m.subject) || topicSubjects(text).some((t) => t.toLowerCase() === m.subject.toLowerCase())
  if (!named) return { ok: false, reason: `subject "${m.subject}" is not named in the text` }
  if (!licenceOk(m.licence)) return { ok: false, reason: `licence "${m.licence || 'unknown'}" is not free` }
  if (!/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(m.sourceUrl)) return { ok: false, reason: 'no Commons file page to credit' }
  if (photo.bytes.length < 20_000) return { ok: false, reason: `file too small (${photo.bytes.length} bytes)` }
  if (m.width !== undefined && m.height !== undefined) {
    if (m.width < QA_MIN_WIDTH) return { ok: false, reason: `too narrow (${m.width}px)` }
    const aspect = m.width / Math.max(1, m.height)
    if (aspect < QA_MIN_ASPECT || aspect > QA_MAX_ASPECT) return { ok: false, reason: `odd shape (${m.width}x${m.height})` }
  }
  return { ok: true }
}

/** The first candidate that passes; every rejection is logged with its reason. */
export function firstPassingPhoto(candidates: (RealPhoto | null | undefined)[], text: string, ctx: Record<string, unknown> = {}): RealPhoto | null {
  for (const c of candidates) {
    if (!c) continue
    const v = photoQa(c, text)
    if (v.ok) return c
    logger.warn({ ...ctx, subject: c.meta.subject, file: c.meta.file, licence: c.meta.licence, reason: v.reason }, 'social photo rejected')
  }
  return null
}
