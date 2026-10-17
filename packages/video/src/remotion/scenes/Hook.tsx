import { fitText } from '@remotion/layout-utils'
import React, { useMemo } from 'react'
import { AbsoluteFill, Audio, Easing, interpolate, Sequence, spring, staticFile, useCurrentFrame } from 'remotion'
import { FPS, SAFE, W } from '../../constants'
import type { HookScene } from '../../types'
import { HighlightSwipe } from '../parts/HighlightSwipe'
import { Backdrop } from '../parts/Backdrop'
import { BlurBg } from '../parts/PhotoPanel'
import { FONT } from '../fonts'
import { useTheme } from '../theme'

const clamp01 = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

export const Hook: React.FC<{ scene: HookScene }> = ({ scene }) => {
  const frame = useCurrentFrame()
  const { theme, mode } = useTheme()
  const maxW = W - SAFE.left - SAFE.right

  const size = useMemo(
    () =>
      Math.min(
        120,
        ...scene.title.map((t) => fitText({ text: t, withinWidth: maxW, fontFamily: 'Unbounded', fontWeight: '900' }).fontSize),
      ),
    [scene.title, maxW],
  )

  // first frame is the theme colour, so the end of the outro loops into it
  const photoIn = interpolate(frame, [0, 8], [0, 1], clamp01)
  const slam = spring({ frame: frame - 12, fps: FPS, config: { damping: mode === 'sombre' ? 200 : 9, stiffness: 220, mass: 0.6 } })
  const pulse = 0.5 + 0.5 * Math.sin(frame * 0.5)

  let wordNo = 0
  const line = (text: string) => (
    <div style={{ whiteSpace: 'nowrap', height: size * 1.12 }}>
      {text.split(' ').map((w, i) => {
        const n = wordNo++
        const p = spring({ frame: frame - 2 - n * 3, fps: FPS, config: theme.spring })
        const y = interpolate(p, [0, 1], [90, 0])
        const opacity = interpolate(frame - 2 - n * 3, [0, 5], [0, 1], clamp01)
        return (
          <React.Fragment key={i}>
            {i > 0 ? <span style={{ display: 'inline-block', width: size * 0.3 }} /> : null}
            <span style={{ display: 'inline-block', transform: `translateY(${y}px)`, opacity }}>{w}</span>
          </React.Fragment>
        )
      })}
    </div>
  )
  // one sweep behind the whole second line, ending exactly at its measured width
  const swipe = interpolate(frame - 8, [0, 14], [0, 1], { ...clamp01, easing: Easing.out(Easing.cubic) })

  return (
    <AbsoluteFill style={{ background: theme.bg }}>
      <div style={{ position: 'absolute', inset: 0, opacity: photoIn }}>
        <BlurBg image={scene.image} blur={30} darken={0.4} scaleFrom={1.05} scaleTo={1.18} duration={scene.durationInFrames} />
      </div>
      <Backdrop />
      <AbsoluteFill style={{ background: `linear-gradient(180deg, rgba(${theme.bgRgb},0.5) 0%, rgba(${theme.bgRgb},0) 35%, rgba(${theme.bgRgb},0.5) 100%)` }} />

      {mode === 'breaking' ? (
        <div style={{ position: 'absolute', left: SAFE.left, top: 600, display: 'flex', alignItems: 'center', gap: 18, opacity: interpolate(frame, [4, 10], [0, 1], clamp01) }}>
          <div style={{ width: 30, height: 30, borderRadius: 30, background: theme.accent, boxShadow: `0 0 0 ${8 + 14 * pulse}px rgba(229,35,27,${0.45 - 0.25 * pulse})` }} />
          <div style={{ background: theme.accent, color: '#fff', fontFamily: FONT.mono, fontWeight: 700, fontSize: 34, letterSpacing: 3, padding: '8px 22px' }}>BREAKING</div>
        </div>
      ) : null}

      <div
        style={{
          position: 'absolute',
          left: SAFE.left,
          width: maxW,
          top: 690,
          fontFamily: FONT.display,
          fontWeight: 900,
          fontSize: size,
          lineHeight: 1.12,
          letterSpacing: '-0.02em',
          textTransform: 'uppercase',
          color: theme.text,
        }}
      >
        {line(scene.title[0])}
        <div style={{ marginTop: 10, height: size * 1.12 }}>
          <HighlightSwipe progress={swipe} color={theme.accent} ink={theme.accentInk} padX={16} padY={6}>
            {line(scene.title[1])}
          </HighlightSwipe>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: SAFE.left,
          top: 690 + size * 2.4 + 90,
          opacity: interpolate(frame, [12, 14], [0, 1], clamp01),
          transform: `scale(${interpolate(slam, [0, 1], [1.4, 1])})`,
          transformOrigin: 'left center',
        }}
      >
        <div style={{ display: 'inline-block', background: '#fff', color: '#0A0A0A', fontFamily: FONT.mono, fontWeight: 700, fontSize: 34, letterSpacing: 2, padding: '14px 30px', borderRadius: 999 }}>
          {scene.dateLine}
        </div>
      </div>

      <Sequence from={12} durationInFrames={12}>
        <Audio src={staticFile('audio/tick.wav')} volume={0.5} />
      </Sequence>
    </AbsoluteFill>
  )
}
