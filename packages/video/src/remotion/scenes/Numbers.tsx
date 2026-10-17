import { measureText } from '@remotion/layout-utils'
import React from 'react'
import { AbsoluteFill, interpolate, spring, useCurrentFrame } from 'remotion'
import { BRAND, FPS, SAFE, W } from '../../constants'
import type { NumbersScene } from '../../types'
import { Backdrop } from '../parts/Backdrop'
import { CountUp } from '../parts/CountUp'
import { FONT } from '../fonts'
import { useTheme } from '../theme'

const clamp01 = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
const DELTA = {
  up: { glyph: '▲', color: BRAND.up },
  down: { glyph: '▼', color: BRAND.down },
  flat: { glyph: '—', color: '#9AA0A6' },
} as const

const TILE_H = 270
const TILE_INNER = W - SAFE.left - SAFE.right - 10 - 72

const sourceFits = (text: string) =>
  measureText({ text, fontFamily: 'Space Mono', fontWeight: '700', fontSize: 20, letterSpacing: '1px' }).width <= TILE_INNER
const GAP = 28

export const Numbers: React.FC<{ scene: NumbersScene }> = ({ scene }) => {
  const frame = useCurrentFrame()
  const { theme } = useTheme()
  const titleP = spring({ frame: frame - 2, fps: FPS, config: theme.spring })
  const total = scene.tiles.length * TILE_H + (scene.tiles.length - 1) * GAP
  const top = 480 + (3 * TILE_H + 2 * GAP - total) / 2

  return (
    <AbsoluteFill style={{ background: theme.bg }}>
      <Backdrop />
      <AbsoluteFill style={{ background: `radial-gradient(900px 700px at 85% 15%, ${theme.accent}22, transparent 70%)` }} />
      <div
        style={{
          position: 'absolute',
          left: SAFE.left,
          top: 300,
          fontFamily: FONT.display,
          fontWeight: 900,
          fontSize: 72,
          letterSpacing: '-0.02em',
          color: theme.text,
          opacity: interpolate(frame, [2, 8], [0, 1], clamp01),
          transform: `translateY(${interpolate(titleP, [0, 1], [50, 0])}px)`,
        }}
      >
        NUMBERS <span style={{ color: theme.accent }}>TODAY</span>
      </div>
      {scene.tiles.map((t, i) => {
        const d = 8 + i * 6
        const p = spring({ frame: frame - d, fps: FPS, config: theme.spring })
        const x = interpolate(p, [0, 1], [W - SAFE.left + 40, 0])
        const dl = DELTA[t.delta]
        return (
          <div
            key={t.label}
            style={{
              position: 'absolute',
              left: SAFE.left,
              top: top + i * (TILE_H + GAP),
              width: W - SAFE.left - SAFE.right,
              height: TILE_H,
              transform: `translateX(${x}px)`,
              background: 'rgba(255,255,255,0.08)',
              borderLeft: `10px solid ${theme.accent}`,
              padding: '30px 36px',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ fontFamily: FONT.mono, fontWeight: 700, fontSize: 28, letterSpacing: 2, color: theme.accent }}>{t.label}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <CountUp
                value={t.value}
                delay={d + 4}
                duration={22}
                style={{ fontFamily: FONT.inter, fontWeight: 900, fontSize: 96, letterSpacing: '-0.03em', color: theme.figure === theme.accent ? theme.text : theme.figure, lineHeight: 1 }}
              />
              <span
                style={{
                  fontFamily: FONT.inter,
                  fontWeight: 900,
                  fontSize: 64,
                  color: dl.color,
                  opacity: interpolate(frame, [d + 18, d + 24], [0, 1], clamp01),
                  transform: `scale(${interpolate(spring({ frame: frame - d - 18, fps: FPS, config: theme.spring }), [0, 1], [0.4, 1])})`,
                }}
              >
                {dl.glyph}
              </span>
            </div>
            <div style={{ fontFamily: FONT.mono, fontWeight: 700, fontSize: 20, letterSpacing: 1, color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap', height: 24 }}>
              {sourceFits(t.source) ? t.source : ''}
            </div>
          </div>
        )
      })}
    </AbsoluteFill>
  )
}
