import { logger } from '../logger.js'
import type { PayloadClient } from '../payload-client.js'
import { findHeroPhoto, type RealPhoto } from './real-photo.js'
import { findOpenversePhoto } from './openverse.js'
import { heroPhotoQa } from './photo-qa.js'
import { renderSocialCardSet, categoryAccentColor } from './social-card.js'

/**
 * The hero image order for every article (13 Nov 2026):
 *  (a) a real photo of the named person or place (Wikimedia Commons, real-photo.ts),
 *  (b) a real photo of the story's topic (Openverse, openverse.ts),
 *  (c) the branded text card.
 * AI illustrations are no longer used as heroes (AI_HERO_IMAGES, default off). Photos of documents and screenshots are
 * rejected at every step (photo-qa.ts) and logged as 'hero rejected'.
 */
export type HeroInput = { title: string; dek?: string; brief?: string; tags: string[] }

export interface HeroFinders {
  commons?: (input: HeroInput) => Promise<RealPhoto | null>
  openverse?: (input: HeroInput, accept: (p: RealPhoto) => boolean) => Promise<RealPhoto | null>
}

export type HeroKind = 'commons' | 'openverse' | 'card'

export function heroKindOf(photo: RealPhoto): 'commons' | 'openverse' {
  return photo.meta.provider === 'openverse' ? 'openverse' : 'commons'
}

/** (a) then (b): a real photo, or null (the caller then uses the branded card). Every photo passes the hero QA. */
export async function findHeroImage(input: HeroInput, finders: HeroFinders = {}): Promise<RealPhoto | null> {
  const ctx = { title: input.title }
  const accept = (p: RealPhoto) => {
    const v = heroPhotoQa(p, `${input.title} ${input.dek ?? ''}`)
    if (!v.ok) logger.warn({ ...ctx, subject: p.meta.subject, file: p.meta.file, provider: p.meta.provider ?? 'commons', reason: v.reason }, 'hero rejected')
    return v.ok
  }
  const commons = finders.commons ?? ((i) => findHeroPhoto(i))
  try {
    const a = await commons(input)
    if (a && accept(a)) return a
  } catch (e) {
    logger.debug({ ...ctx, err: e instanceof Error ? e.message : e }, 'hero: commons lookup failed')
  }
  const openverse = finders.openverse ?? ((i, acc) => findOpenversePhoto({ title: i.title, dek: i.dek, tags: i.tags }, { accept: acc }))
  try {
    const b = await openverse(input, accept)
    if (b) return b
  } catch (e) {
    logger.debug({ ...ctx, err: e instanceof Error ? e.message : e }, 'hero: openverse lookup failed')
  }
  return null
}

/** media.license for a real photo: Commons files are 'wikimedia', other Openverse sources (Flickr) 'stock' */
export function heroMediaMeta(photo: RealPhoto) {
  return { license: photo.meta.fromCommons === false ? 'stock' : 'wikimedia', isAiGenerated: false, credit: photo.meta.mediaCredit }
}

export async function uploadHeroPhoto(payload: PayloadClient, photo: RealPhoto, alt: string, filename: string) {
  return payload.uploadMedia(new Blob([new Uint8Array(photo.bytes)], { type: photo.mime }), { alt, ...heroMediaMeta(photo), filename })
}

/** The branded text card as a hero (our own design, labelled 'own'): the last step, never an AI image. */
export async function uploadBrandCard(
  payload: PayloadClient,
  card: { title: string; dek?: string; category: string; breaking?: boolean },
  filename: string,
): Promise<{ id: string; url?: string | null }> {
  const { og } = await renderSocialCardSet({
    title: card.title,
    dek: card.dek ?? '',
    category: card.category,
    categoryColor: categoryAccentColor(card.category),
    locale: 'en',
    photo: null,
    breaking: card.breaking,
  })
  return payload.uploadMedia(new Blob([new Uint8Array(og)], { type: 'image/png' }), { alt: card.title, license: 'own', isAiGenerated: false, credit: 'Zaviya', filename })
}

const GUARD_SEARCH_MS = 45_000

/**
 * Publish guard: an article never goes live without a hero. Real photo (a, then b), else the branded card.
 * Returns the media id and which step made it; null only when even the card could not be uploaded.
 */
export async function ensureHeroMedia(
  payload: PayloadClient,
  input: HeroInput & { category: string; slug?: string; breaking?: boolean },
  finders: HeroFinders = {},
): Promise<{ id: string; kind: HeroKind } | null> {
  const name = input.slug ?? input.title
  try {
    // The guard runs at the last step with the publish slot held: a slow photo search must not hold the story up for minutes
    const photo = await Promise.race([findHeroImage(input, finders), new Promise<null>((r) => setTimeout(() => r(null), GUARD_SEARCH_MS).unref?.())])
    if (photo) {
      const up = await uploadHeroPhoto(payload, photo, input.title, name)
      return { id: String(up.id), kind: heroKindOf(photo) }
    }
  } catch (e) {
    logger.warn({ err: e instanceof Error ? e.message : e, title: input.title }, 'hero guard: real photo upload failed')
  }
  try {
    const up = await uploadBrandCard(payload, { title: input.title, dek: input.dek, category: input.category, breaking: input.breaking }, `${name}-card`)
    return { id: String(up.id), kind: 'card' }
  } catch (e) {
    logger.error({ err: e instanceof Error ? e.message : e, title: input.title }, 'hero guard: could not make any hero')
    return null
  }
}
