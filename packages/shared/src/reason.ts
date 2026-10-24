/**
 * ZAV-200: a triage "reason" sometimes degenerates into a repetition loop ("a-priori-a-priori-...",
 * "Tier 2 source. Tier 2 source. ..."). The editor cannot judge from it, so the loop is cut off.
 */

const WORD = /[\p{L}\p{N}]+/gu
const MAX_PHRASE_WORDS = 8

/**
 * Where a repetition loop ends its first round: the text up to that offset is the phrase once.
 * A loop is a phrase of 1-8 words that repeats back to back at least 3 times (4 for a single word).
 * Returns null when the text does not loop.
 */
export function repetitionCutoff(text: string): number | null {
  const words = [...text.matchAll(WORD)].map((m) => ({ w: m[0].toLowerCase(), end: (m.index ?? 0) + m[0].length }))
  for (let i = 0; i < words.length; i++) {
    for (let n = 1; n <= MAX_PHRASE_WORDS; n++) {
      const need = n === 1 ? 4 : 3
      if (i + n * need > words.length) break
      let rounds = 1
      while (i + (rounds + 1) * n <= words.length) {
        let same = true
        for (let j = 0; j < n; j++) if (words[i + rounds * n + j]!.w !== words[i + j]!.w) { same = false; break }
        if (!same) break
        rounds++
      }
      if (rounds >= need) return words[i + n - 1]!.end
    }
  }
  return null
}

export const REASON_LOOP_MARK = ' [reason cut: the model repeated itself]'

/** The reason as the editor sees it: a repetition loop is cut to its first round, then the text is capped at 400 characters. */
export function tidyReason(text: string, max = 400): string {
  let out = text
  const cut = repetitionCutoff(text)
  if (cut !== null) out = `${text.slice(0, cut).replace(/[\s*_\-,;:]+$/, '')}.${REASON_LOOP_MARK}`
  return out.length > max ? `${out.slice(0, max - 1)}…` : out
}
