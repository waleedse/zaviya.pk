import React from 'react'
import { AbsoluteFill, Audio, interpolate, Sequence, spring, staticFile, useCurrentFrame } from 'remotion'
import { FPS, SAFE, W } from '../../constants'
import type { OutroScene } from '../../types'
import { Backdrop } from '../parts/Backdrop'
import { Logo } from '../parts/Logo'
import { PLATFORMS, SocialIcon } from '../parts/SocialIcons'
import { FONT } from '../fonts'
import { useTheme } from '../theme'

const clamp01 = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

export const Outro: React.FC<{ scene: OutroScene }> = ({ scene }) => {
  const frame = useCurrentFrame()
  const { theme, beat, mode } = useTheme()
  const hasChips = scene.count > 0
  const half = Math.max(3, Math.round(beat / 3))
  const chipStep = hasChips ? Math.max(2, Math.min(half, Math.floor(36 / scene.count))) : half

  const words = scene.cta.split(' ')
  const chipAt = (i: number) => 14 + i * chipStep
  const iconStart = hasChips ? chipAt(scene.count) + 4 : 14
  const iconAt = (i: number) => iconStart + i * half
  const handleAt = iconAt(PLATFORMS.length - 1) + 2
  const linkAt = handleAt + 8
  const pop = (at: number) => spring({ frame: frame - at, fps: FPS, config: theme.spring })

  // chips: up to 6 per row; more wrap to a second row
  const perRow = 6
  const rows = Math.ceil(scene.count / perRow)
  const chip = Math.min(150, Math.floor((W - SAFE.left - SAFE.right - 14 * (Math.min(scene.count, perRow) - 1)) / Math.min(scene.count || 1, perRow)))
  const chipsTop = 760
  const rowShift = hasChips ? (rows - 1) * (chip + 14) : -(150 + 40)
  const iconsTop = 1010 + rowShift
  const handleTop = 1230 + rowShift
  const linkTop = 1390 + rowShift

  // last 10 frames go back to the hook's opening colour, so the video loops
  const toHook = interpolate(frame, [scene.durationInFrames - 10, scene.durationInFrames - 1], [0, 1], clamp01)

  const maxW = W - SAFE.left - SAFE.right
  return (
    <AbsoluteFill style={{ background: theme.bg }}>
      <Backdrop />
      <AbsoluteFill style={{ background: `radial-gradient(1000px 800px at 15% 85%, ${theme.accent}20, transparent 70%)` }} />

      <div style={{ position: 'absolute', left: SAFE.left, top: 210, opacity: interpolate(frame, [0, 8], [0, 1], clamp01) }}>
        <Logo scale={1.3} opacity={1} />
      </div>

      <div
        style={{
          position: 'absolute',
          left: SAFE.left,
          top: 360,
          width: maxW,
          fontFamily: FONT.inter,
          fontWeight: 900,
          fontSize: 88,
          lineHeight: 1.04,
          letterSpacing: '-0.03em',
          color: theme.text,
        }}
      >
        {words.map((w, i) => {
          const p = pop(1 + i * 2)
          const isNum = /\d/.test(w)
          return (
            <span
              key={i}
              style={{
                display: 'inline-block',
                marginRight: '0.26em',
                transform: `translateY(${interpolate(p, [0, 1], [50, 0])}px)`,
                opacity: interpolate(frame - 1 - i * 2, [0, 5], [0, 1], clamp01),
                color: isNum ? theme.accent : theme.text,
              }}
            >
              {w}
            </span>
          )
        })}
      </div>

      {hasChips ? (
        <div style={{ position: 'absolute', left: SAFE.left, top: chipsTop, width: maxW, display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'flex-start' }}>
          {Array.from({ length: scene.count }, (_, i) => {
            const p = pop(chipAt(i))
            return (
              <div
                key={i}
                style={{
                  width: chip,
                  height: chip,
                  borderRadius: 24,
                  background: theme.accent,
                  color: theme.accentInk,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: FONT.display,
                  fontWeight: 900,
                  fontSize: chip * 0.5,
                  transform: `scale(${interpolate(p, [0, 1], [0, 1])})`,
                }}
              >
                {i + 1}
              </div>
            )
          })}
        </div>
      ) : null}

      <div style={{ position: 'absolute', left: SAFE.left, top: iconsTop, width: maxW, display: 'flex', justifyContent: 'space-between' }}>
        {PLATFORMS.map((pl, i) => {
          const p = pop(iconAt(i))
          return (
            <div
              key={pl}
              style={{
                width: 150,
                height: 150,
                borderRadius: 150,
                border: '4px solid rgba(255,255,255,0.85)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transform: `scale(${interpolate(p, [0, 1], [0, 1])})`,
              }}
            >
              <SocialIcon platform={pl} size={76} />
            </div>
          )
        })}
      </div>

      <div
        style={{
          position: 'absolute',
          left: SAFE.left,
          top: handleTop,
          fontFamily: FONT.display,
          fontWeight: 900,
          fontSize: 92,
          letterSpacing: '-0.02em',
          color: theme.accent,
          opacity: interpolate(frame, [handleAt, handleAt + 4], [0, 1], clamp01),
          transform: `translateY(${interpolate(pop(handleAt), [0, 1], [40, 0])}px)`,
          whiteSpace: 'nowrap',
        }}
      >
        {scene.handles[0]}
      </div>

      <div
        style={{
          position: 'absolute',
          left: SAFE.left,
          top: linkTop,
          fontFamily: FONT.mono,
          fontWeight: 700,
          fontSize: 40,
          letterSpacing: 1,
          color: theme.text,
          opacity: interpolate(frame, [linkAt, linkAt + 6], [0, 1], clamp01),
        }}
      >
        Full stories → {scene.site}
      </div>

      <AbsoluteFill style={{ background: theme.bg, opacity: toHook }} />

      {mode !== 'sombre'
        ? [...(hasChips ? Array.from({ length: scene.count }, (_, i) => chipAt(i)) : []), ...PLATFORMS.map((_, i) => iconAt(i))].map((at, i) => (
            <Sequence key={i} from={at} durationInFrames={8}>
              <Audio src={staticFile('audio/pop.wav')} volume={0.3} />
            </Sequence>
          ))
        : null}
    </AbsoluteFill>
  )
}
