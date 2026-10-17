import { measureText } from '@remotion/layout-utils'
import React, { useMemo } from 'react'
import { Easing, interpolate, spring, useCurrentFrame } from 'remotion'
import { FPS } from '../../constants'
import { FONT } from '../fonts'
import { useTheme } from '../theme'
import { HighlightSwipe } from './HighlightSwipe'

export interface HeadlineLayout {
  size: number
  lineHeight: number
  lines: { text: string; start: number }[]
  height: number
}

const LINE_HEIGHT = 1.02

function measure(text: string, size: number): number {
  return measureText({
    text,
    fontFamily: 'Inter',
    fontWeight: '900',
    fontSize: size,
    letterSpacing: `${(-0.03 * size).toFixed(2)}px`,
  }).width
}

/** Greedy wrap by measured width, so lines are the same on every render. `start` is the char offset in `text`. */
export function wrap(text: string, size: number, maxWidth: number) {
  const words = [...text.matchAll(/\S+/g)].map((m) => ({ w: m[0], at: m.index! }))
  const lines: { text: string; start: number }[] = []
  let cur: { text: string; start: number } | null = null
  for (const { w, at } of words) {
    if (!cur) {
      cur = { text: w, start: at }
      continue
    }
    if (measure(`${cur.text} ${w}`, size) <= maxWidth) cur.text += ` ${w}`
    else {
      lines.push(cur)
      cur = { text: w, start: at }
    }
  }
  if (cur) lines.push(cur)
  return lines
}

/** Largest size from 96 down to 52 that fits `maxWidth` in at most 4 lines and within `maxHeight`. */
export function layoutHeadline(text: string, maxWidth = 952, maxHeight = 460): HeadlineLayout {
  let last: HeadlineLayout | null = null
  for (let size = 96; size >= 52; size -= 4) {
    const lines = wrap(text, size, maxWidth)
    const widest = Math.max(...lines.map((l) => measure(l.text, size)))
    const height = lines.length * size * LINE_HEIGHT
    last = { size, lineHeight: LINE_HEIGHT, lines, height }
    if (lines.length <= 4 && height <= maxHeight && widest <= maxWidth) return last
  }
  return last!
}

export const KineticHeadline: React.FC<{
  text: string
  highlight?: string
  layout: HeadlineLayout
  /** frames the scene lasts, for the highlight timing */
  duration: number
  startFrame?: number
}> = ({ text, highlight, layout, duration, startFrame = 8 }) => {
  const frame = useCurrentFrame()
  const { theme } = useTheme()

  const hl = useMemo(() => {
    if (!highlight) return null
    const i = text.toLowerCase().indexOf(highlight.toLowerCase())
    return i < 0 ? null : ([i, i + highlight.length] as const)
  }, [text, highlight])

  const swipeAt = Math.round(duration * 0.55)
  let wordNo = 0
  return (
    <div style={{ fontFamily: FONT.inter, fontWeight: 900, fontSize: layout.size, lineHeight: layout.lineHeight, letterSpacing: '-0.03em', color: theme.text }}>
      {layout.lines.map((line, li) => {
        const words = [...line.text.matchAll(/\S+/g)].map((m) => ({ w: m[0], at: line.start + m.index! }))
        return (
          <div key={li} style={{ whiteSpace: 'nowrap', height: layout.size * layout.lineHeight }}>
            {words.map(({ w, at }, wi) => {
              const n = wordNo++
              const p = spring({ frame: frame - startFrame - n * 2, fps: FPS, config: theme.spring })
              const y = interpolate(p, [0, 1], [40, 0])
              const opacity = interpolate(frame - startFrame - n * 2, [0, 5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
              const isHl = hl && at < hl[1] && at + w.length > hl[0]
              const swipe = isHl
                ? interpolate(frame - swipeAt - n * 2, [0, 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) })
                : 0
              return (
                <React.Fragment key={wi}>
                  {wi > 0 ? ' ' : null}
                  <span style={{ display: 'inline-block', transform: `translateY(${y}px)`, opacity }}>
                    {isHl ? (
                      <HighlightSwipe progress={swipe} color={theme.accent} ink={theme.accentInk} padX={10} padY={4}>
                        {w}
                      </HighlightSwipe>
                    ) : (
                      w
                    )}
                  </span>
                </React.Fragment>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
