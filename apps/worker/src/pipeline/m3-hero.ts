import { generateViaComfy } from './comfy.js'
import { zimagePrompt } from './flux.js'

/**
 * Labelled AI hero scenes from Z-Image on our own M3 (free, on 24/7), for every path that used to fall back to the
 * branded text card: the publish guard, the hero backfill job and the sweep (Waleed, 17 Nov: section pages showed
 * desk-colour placeholders instead of pictures; "generate them through the M3, never publish with a wrong image").
 * Rules: a real Commons/Openverse photo always comes first; an AI image is a generic scene only (no real people,
 * no named buildings) and is labelled "AI image" on the site (isAiGenerated).
 */

const on = (v: string | undefined) => v === 'true' || v === '1'

/** null when AI heroes are off or the M3 is not configured */
export function m3Generator(brief: string, clusterId: string, timeoutMs = 240_000): (() => Promise<Blob | null>) | undefined {
  const url = process.env.COMFY_URL
  if (!url || !on(process.env.AI_HERO_IMAGES)) return undefined
  return () => generateViaComfy(zimagePrompt(brief), { url, clusterId, timeoutMs })
}

const DESK_SCENE: Record<string, string> = {
  pakistan: 'a busy street in a Pakistani city at daytime',
  business: 'a Pakistani market and office district, trade and money',
  world: 'a world map on a desk with newspapers',
  cricket: 'a cricket ground with stumps and a ball on the pitch',
  sports: 'an empty sports stadium under floodlights',
  'education-jobs': 'students and a classroom with desks and books',
  ai: 'a computer screen with code and a circuit board',
  'tech-telecom': 'smartphones and a mobile network tower',
  autos: 'cars on a road in Pakistan',
  trending: 'a smartphone showing a social media feed',
}

/**
 * A safe scene for an old story that has no writer's image brief: the desk's scene plus the headline's ordinary words.
 * Capitalised words (names of people, parties, places, firms) are dropped so the model never draws a fake person.
 */
export function genericScene(title: string, category = 'pakistan'): string {
  const words = title
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w && !/^\p{Lu}/u.test(w) && !/^\d/.test(w) && w.length > 3 && !STOP.has(w.toLowerCase()))
    .slice(0, 6)
  const topic = words.length ? `about ${words.join(' ')}` : ''
  return `${DESK_SCENE[category] ?? DESK_SCENE.pakistan}, ${topic}`.replace(/,\s*$/, '')
}

const STOP = new Set(['with', 'from', 'after', 'over', 'into', 'than', 'that', 'this', 'their', 'says', 'said', 'will', 'were', 'have', 'been', 'amid', 'today', 'more', 'less'])
