import { measureText } from '@remotion/layout-utils'
import React, { useMemo } from 'react'
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame } from 'remotion'
import { FPS, SAFE, W } from '../../constants'
import type { QuickHitsScene } from '../../types'
import { Backdrop } from '../parts/Backdrop'
import { FONT } from '../fonts'
import { useTheme } from '../theme'
import { resolveImage } from '../util'

const clamp01 = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
const ROW_H = 230
const GAP = 18
const TEXT_W = 610
const SIZE = 52

function wrapLines(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    const width = measureText({ text: next, fontFamily: 'Inter', fontWeight: '800', fontSize: SIZE, letterSpacing: `${-0.02 * SIZE}px` }).width
    if (width <= TEXT_W || !cur) cur = next
    else {
      lines.push(cur)
      cur = w
    }
  }
  if (cur) lines.push(cur)
  return lines
}

export const QuickHits: React.FC<{ scene: QuickHitsScene }> = ({ scene }) => {
  const frame = useCurrentFrame()
  const { theme, beat } = useTheme()
  const titleP = spring({ frame: frame - 2, fps: FPS, config: theme.spring })
  const lines = useMemo(() => scene.rows.map((r) => wrapLines(r.headline)), [scene.rows])
  const top = 470

  return (
    <AbsoluteFill style={{ background: theme.bg }}>
      <Backdrop />
      <AbsoluteFill style={{ background: `radial-gradient(900px 700px at 15% 10%, ${theme.accent}22, transparent 70%)` }} />
      <div
        style={{
          position: 'absolute',
          left: SAFE.left,
          top: 300,
          fontFamily: FONT.display,
          fontWeight: 900,
          fontSize: 66,
          letterSpacing: '-0.02em',
          color: theme.text,
          opacity: interpolate(frame, [2, 8], [0, 1], clamp01),
          transform: `translateY(${interpolate(titleP, [0, 1], [50, 0])}px)`,
        }}
      >
        MORE <span style={{ color: theme.accent }}>HEADLINES</span>
      </div>
      {scene.rows.map((r, i) => {
        const d = 10 + i * beat
        const p = spring({ frame: frame - d, fps: FPS, config: theme.spring })
        const x = interpolate(p, [0, 1], [W, 0])
        const thumb = spring({ frame: frame - d - 4, fps: FPS, config: theme.spring })
        return (
          <div
            key={r.storyId}
            style={{
              position: 'absolute',
              left: SAFE.left,
              top: top + i * (ROW_H + GAP),
              width: W - SAFE.left - SAFE.right,
              height: ROW_H,
              transform: `translateX(${x}px)`,
              background: 'rgba(255,255,255,0.08)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <div style={{ width: 14, alignSelf: 'stretch', background: r.category.color }} />
            <div style={{ width: 128, textAlign: 'center', fontFamily: FONT.display, fontWeight: 900, fontSize: 60, color: theme.accent }}>{r.number}</div>
            <div style={{ width: TEXT_W, fontFamily: FONT.inter, fontWeight: 800, fontSize: SIZE, lineHeight: 1.05, letterSpacing: '-0.02em', color: theme.text }}>
              {lines[i]!.map((l, li) => (
                <div key={li} style={{ whiteSpace: 'nowrap' }}>
                  {l}
                </div>
              ))}
            </div>
            <div style={{ marginLeft: 'auto', marginRight: 24, width: 160, height: 160, overflow: 'hidden', transform: `scale(${interpolate(thumb, [0, 1], [0, 1])})` }}>
              <Img src={resolveImage(r.image)} style={{ width: 160, height: 160, objectFit: 'cover' }} />
            </div>
          </div>
        )
      })}
    </AbsoluteFill>
  )
}
