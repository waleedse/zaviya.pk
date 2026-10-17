/** Dynamic photo / text-area split for a story scene. Pure: all heights are measured by the caller. */

export const LAYOUT = {
  bottom: 1680, // text block is bottom-anchored here (1920 - 240 safe area)
  minPhoto: 760,
  maxPhoto: 1240,
  dekMinPhoto: 900,
  badgeH: 60,
  tickerH: 56,
  gap: 24,
  urduGap: 12,
  creditH: 30,
} as const

export interface StoryMetrics {
  headlineH: number
  figureH?: number
  dekH?: number
  urduH?: number
  hasCredit?: boolean
  /** breaking theme: a ticker strip sits on top of the text block */
  ticker?: boolean
  /** show the dek whatever the room */
  dekAlways?: boolean
}

export interface StoryLayout {
  photoHeight: number
  textTop: number
  gradientStart: number
  overlayOpacity: number
  textHeight: number
  dekShown: boolean
  /** y of each block, relative to textTop */
  offsets: { ticker: number; badge: number; figure: number; headline: number; urdu: number; dek: number; credit: number }
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

function stack(m: StoryMetrics, withDek: boolean) {
  let y = 0
  const o = { ticker: 0, badge: 0, figure: 0, headline: 0, urdu: 0, dek: 0, credit: 0 }
  if (m.ticker) {
    o.ticker = y
    y += LAYOUT.tickerH + 16
  }
  o.badge = y
  y += LAYOUT.badgeH + LAYOUT.gap
  if (m.figureH) {
    o.figure = y
    y += m.figureH + LAYOUT.gap
  }
  o.headline = y
  y += m.headlineH
  if (m.urduH) {
    y += LAYOUT.urduGap
    o.urdu = y
    y += m.urduH
  }
  if (withDek && m.dekH) {
    y += LAYOUT.gap
    o.dek = y
    y += m.dekH
  }
  if (m.hasCredit) {
    y += LAYOUT.gap
    o.credit = y
    y += LAYOUT.creditH
  }
  return { height: y, offsets: o }
}

/** Less text gives a smaller dark area and a bigger photo. */
export function layoutStory(m: StoryMetrics): StoryLayout {
  const photoFor = (h: number) => clamp(LAYOUT.bottom - h - 40, LAYOUT.minPhoto, LAYOUT.maxPhoto)
  let withDek = !!m.dekH
  let st = stack(m, withDek)
  if (withDek && !m.dekAlways && photoFor(st.height) < LAYOUT.dekMinPhoto) {
    withDek = false
    st = stack(m, false)
  }
  const textTop = LAYOUT.bottom - st.height
  const photoHeight = photoFor(st.height)
  return {
    photoHeight,
    textTop,
    gradientStart: textTop - 160,
    overlayOpacity: clamp(0.55 + 0.25 * (st.height / 900), 0.55, 0.85),
    textHeight: st.height,
    dekShown: withDek,
    offsets: st.offsets,
  }
}
