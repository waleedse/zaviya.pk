import type { Payload } from 'payload'
import { RESULT_BOARDS } from './result-boards'
import { VACATION_REGIONS } from './vacations'

/**
 * Create the missing board and vacation documents (idempotent; safe on every boot). Boards start with their directory
 * name and verified official site and NO dates. Punjab gets last year's break as a sourced "last year" note.
 */
export async function ensureResultsSeed(payload: Payload): Promise<string[]> {
  const made: string[] = []
  const have = new Set((await payload.find({ collection: 'result-boards', limit: 200, pagination: false, depth: 0, overrideAccess: true })).docs.map((d) => d.slug))
  for (const b of RESULT_BOARDS) {
    if (have.has(b.slug)) continue
    await payload.create({
      collection: 'result-boards',
      context: { skipRevalidate: true },
      data: { name: b.name, slug: b.slug, region: b.region, city: b.city, officialSite: b.officialSite },
    })
    made.push(b.slug)
  }
  const haveRegions = new Set((await payload.find({ collection: 'vacation-notices', limit: 20, pagination: false, depth: 0, overrideAccess: true })).docs.map((d) => d.region))
  for (const r of VACATION_REGIONS) {
    if (haveRegions.has(r.slug)) continue
    await payload.create({
      collection: 'vacation-notices',
      data: {
        region: r.slug,
        status: 'not_announced',
        ...(r.slug === 'punjab'
          ? {
              lastYear: {
                note: 'Winter break 2025-26 in Punjab: the dates leaked on 8 November 2025 (reported by ProPakistani) and were notified on 4 December 2025; the break ran from 22 or 23 December 2025 to 10 January 2026. This is last year, not this year.',
              },
            }
          : {}),
      },
    })
    made.push(`vacation:${r.slug}`)
  }
  return made
}
