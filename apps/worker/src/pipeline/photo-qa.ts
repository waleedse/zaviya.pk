import { logger } from '../logger.js'
import { licenceOk, namedIn, worshipSiteMismatch, type RealPhoto } from './real-photo.js'
import { topicSubjects } from './photo-topics.js'
import { analyzeImage, documentReason } from './image-stats.js'

/**
 * Last check before a photo goes on a social card: the photo's subject is named in the headline (or the quote), the licence
 * is free, and the size and shape are fine. A failed check is logged as 'social photo rejected' with the reason, so the
 * 3-hourly review can audit it; the caller then tries the next candidate.
 */
export const QA_MIN_WIDTH = 600
export const QA_MIN_ASPECT = 0.45
export const QA_MAX_ASPECT = 3

/**
 * Words in a file title, alt text or credit that say the image is a document or a screenshot, not a photo
 * (a Malaysian "Kenyataan Akhbar" page, a Reddit capture, a scanned notification).
 */
const DOCUMENT_WORDS = /press[\s_-]*release|press[\s_-]*statement|kenyataan|siaran akhbar|screen[\s_-]?shot|screen[\s_-]?cap(ture)?|\bscan(ned)?\b|\bletters?\b|notification|\bnotice\b|document|\bpage\b|\bpdf\b|\bmemo\b|circular|gazette|certificate|\binvoice\b|\breceipt\b|\bform\b|\btweet\b|reddit|facebook post|infographic|\bslides?\b|web[\s_-]?page/i

/** Why this name says "document or screenshot", or null when the names look like a photo. */
export function documentNameReason(...names: (string | undefined | null)[]): string | null {
  for (const n of names) {
    const t = (n ?? '').replace(/[_]+/g, ' ')
    const m = DOCUMENT_WORDS.exec(t)
    if (m) return `name says document/screenshot ("${m[0].trim()}")`
  }
  return null
}

/** The image bytes look like a page or a screenshot (mostly white, a few flat colours). Unknown formats pass. */
export function documentPixelReason(bytes: Buffer, mime?: string): string | null {
  const stats = analyzeImage(bytes, mime)
  return stats ? documentReason(stats) : null
}

/**
 * Weapons being fired, combat and explosion photos (an Afghan Army "in combat during the 2021 offensive" on an arrest story).
 * Used only when the story is literally about a battle or war; never for arrest, court or crime stories.
 */
const COMBAT_WORDS = /\b(rpg|firing|fires|fired|shooting|gun ?fire|gunfight|combat|battle|battlefield|airstrike|air strike|explosions?|exploding|bombing|bombed|missile|grenade|mortar|artillery|shelling|insurgents?|ambush|offensive|machine ?gun|ak-?47|rifle|warfare|fighting|firefight|war zone|skirmish)\b/i
const WAR_STORY = /\b(war|battle|airstrikes?|air strikes?|offensive|clashes|combat|invasion|shelling|ceasefire|missiles?|bombardment|frontline|troops)\b/i
const CRIME_STORY = /\b(arrest(ed|s)?|held|detain(ed|s)?|custody|sentenc\w*|court|trial|bail|remand|convict\w*|jail\w*|police|crime|murder\w*|fir|charged|accused|alleg\w*|suspects?|case|verdict|judge)\b/i

/** Why this photo must not illustrate this story, or null. `text` is the headline (and dek) the photo would sit under. */
export function combatReason(text: string, ...names: (string | undefined | null)[]): string | null {
  const name = names.map((n) => (n ?? '').replace(/[_]+/g, ' ')).join(' ')
  const m = COMBAT_WORDS.exec(name)
  if (!m) return null
  if (CRIME_STORY.test(text)) return `combat photo ("${m[0]}") on an arrest, court or crime story`
  if (!WAR_STORY.test(text)) return `combat photo ("${m[0]}") but the story is not about a battle or war`
  return null
}

export type PhotoVerdict = { ok: true } | { ok: false; reason: string }

export function photoQa(photo: Pick<RealPhoto, 'meta' | 'bytes'>, text: string): PhotoVerdict {
  const m = photo.meta
  if (!m.subject) return { ok: false, reason: 'no subject recorded for the photo' }
  // named in the headline/quote, or a topic place the headline maps to (Congress -> the Capitol)
  const named = namedIn(text, m.subject) || topicSubjects(text).some((t) => t.toLowerCase() === m.subject.toLowerCase())
  if (!named) return { ok: false, reason: `subject "${m.subject}" is not named in the text` }
  if (m.file && worshipSiteMismatch(m.subject, m.file)) return { ok: false, reason: `worship site photo "${m.file}" for subject "${m.subject}"` }
  if (!licenceOk(m.licence)) return { ok: false, reason: `licence "${m.licence || 'unknown'}" is not free` }
  if (!/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(m.sourceUrl)) return { ok: false, reason: 'no Commons file page to credit' }
  if (photo.bytes.length < 20_000) return { ok: false, reason: `file too small (${photo.bytes.length} bytes)` }
  if (m.width !== undefined && m.height !== undefined) {
    if (m.width < QA_MIN_WIDTH) return { ok: false, reason: `too narrow (${m.width}px)` }
    const aspect = m.width / Math.max(1, m.height)
    if (aspect < QA_MIN_ASPECT || aspect > QA_MAX_ASPECT) return { ok: false, reason: `odd shape (${m.width}x${m.height})` }
  }
  const doc = documentNameReason(m.file, m.subject) ?? combatReason(text, m.file) ?? documentPixelReason(photo.bytes, (photo as { mime?: string }).mime)
  if (doc) return { ok: false, reason: doc }
  return { ok: true }
}

/**
 * Article heroes (Commons or Openverse): free licence, credit page, size, and never a document or screenshot.
 * Unlike social cards the subject need not be named in the text (a topic photo of "Pakistan police" is fine).
 * A failed check is logged as 'hero rejected' by the caller; the next candidate or the next step of the hero order follows.
 */
export function heroPhotoQa(photo: Pick<RealPhoto, 'meta' | 'bytes' | 'mime'>, text = ''): PhotoVerdict {
  const m = photo.meta
  if (!licenceOk(m.licence)) return { ok: false, reason: `licence "${m.licence || 'unknown'}" is not free` }
  if (!/^https:\/\//.test(m.sourceUrl)) return { ok: false, reason: 'no file page to credit' }
  if (photo.bytes.length < 20_000) return { ok: false, reason: `file too small (${photo.bytes.length} bytes)` }
  if (m.width !== undefined && m.height !== undefined && m.width < 600) return { ok: false, reason: `too narrow (${m.width}px)` }
  if (m.file && m.provider !== 'openverse' && worshipSiteMismatch(m.subject, m.file)) return { ok: false, reason: `worship site photo "${m.file}" for subject "${m.subject}"` }
  const doc = documentNameReason(m.file, m.subject) ?? combatReason(text, m.file) ?? documentPixelReason(photo.bytes, photo.mime)
  if (doc) return { ok: false, reason: doc }
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
