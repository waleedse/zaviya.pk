/**
 * ZAV-148: a cluster's headline used to be the title of whichever item created it and was never revisited, so a
 * stray first item ("Week 5 inactives for Eagles") kept naming a 92-item Khyber Pakhtunkhwa cluster. The headline is
 * now the title that shares the most words with the rest of the cluster (a stand-in for the centroid).
 */
export type HeadlineCandidate = { title: string; tier?: number }

/** Clusters this small keep the headline of the item that created them. */
export const MIN_ITEMS_FOR_HEADLINE_VOTE = 3

function words(title: string): Set<string> {
  const base = title.replace(/\s+[-|–—]\s+[^-|–—]{2,40}$/, '').toLowerCase()
  return new Set(base.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4))
}

export function pickClusterHeadline(items: HeadlineCandidate[], current: string): string {
  if (items.length < MIN_ITEMS_FOR_HEADLINE_VOTE) return current
  const sets = items.map((i) => words(i.title))
  let best = -1
  let bestScore = -1
  for (let i = 0; i < items.length; i++) {
    const own = sets[i]!
    if (own.size < 2) continue
    let score = 0
    for (let j = 0; j < items.length; j++) {
      if (i === j) continue
      const other = sets[j]!
      let shared = 0
      for (const w of own) if (other.has(w)) shared++
      score += shared / Math.max(own.size, other.size, 1)
    }
    // Trusted outlets win ties; the earlier item wins after that.
    const tierBonus = (4 - (items[i]!.tier ?? 3)) * 1e-3
    if (score + tierBonus > bestScore) {
      bestScore = score + tierBonus
      best = i
    }
  }
  return best >= 0 && bestScore > 0.01 ? items[best]!.title : current
}
