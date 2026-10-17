import { fitText, measureText } from '@remotion/layout-utils'
import React, { useMemo } from 'react'
import { AbsoluteFill, interpolate, spring, useCurrentFrame } from 'remotion'
import { BRAND, FPS, SAFE, W } from '../../constants'
import { layoutStory, LAYOUT } from '../../layout'
import type { StoryScene } from '../../types'
import { Backdrop } from '../parts/Backdrop'
import { CategoryChip } from '../parts/CategoryChip'
import { CountUp } from '../parts/CountUp'
import { KineticHeadline, layoutHeadline } from '../parts/KineticHeadline'
import { BlurBg, PhotoPanel } from '../parts/PhotoPanel'
import { FONT } from '../fonts'
import { useTheme } from '../theme'

const CONTENT_W = W - SAFE.left - SAFE.right // 952
const DEK_SIZE = 36
const BADGE_H = LAYOUT.badgeH

const clamp01 = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

function urduLayout(text: string) {
  const mk = (size: number) => {
    const w = measureText({ text, fontFamily: 'Noto Nastaliq Urdu', fontWeight: '700', fontSize: size }).width
    return { size, lines: Math.max(1, Math.ceil((w * 1.04) / CONTENT_W)) }
  }
  let l = mk(48)
  if (l.lines > 2) l = mk(40)
  return { ...l, height: l.lines * l.size * 1.9 }
}

export const Story: React.FC<{ scene: StoryScene }> = ({ scene }) => {
  const frame = useCurrentFrame()
  const { theme } = useTheme()

  const m = useMemo(() => {
    const headline = layoutHeadline(scene.headline, CONTENT_W, 440)
    let figure: { size: number; h: number } | null = null
    if (scene.figure) {
      const size = Math.min(110, fitText({ text: scene.figure.value, withinWidth: CONTENT_W, fontFamily: 'Unbounded', fontWeight: '900' }).fontSize)
      figure = { size, h: Math.round(size * 1.05 + 14 + 32) }
    }
    const urdu = scene.headlineUr ? urduLayout(scene.headlineUr) : null
    let dek: { lines: number; h: number } | null = null
    if (scene.dek) {
      const w = measureText({ text: scene.dek, fontFamily: 'Inter', fontWeight: '700', fontSize: DEK_SIZE }).width
      const lines = Math.min(3, Math.max(1, Math.ceil((w * 1.08) / CONTENT_W)))
      dek = { lines, h: Math.round(lines * DEK_SIZE * 1.35) }
    }
    const layout = layoutStory({
      headlineH: headline.height,
      figureH: figure?.h,
      urduH: urdu?.height,
      dekH: dek?.h,
      hasCredit: !!scene.credit,
      ticker: theme.ticker,
      dekAlways: scene.dekAlways,
    })
    return { headline, figure, urdu, dek, layout }
  }, [scene, theme.ticker])

  const { layout } = m
  const o = layout.offsets
  const y = (off: number) => layout.textTop + off

  const badge = spring({ frame: frame - 4, fps: FPS, config: theme.spring })
  const fadeUrdu = interpolate(frame, [20, 30], [0, 1], clamp01)
  const fadeDek = interpolate(frame, [26, 36], [0, 1], clamp01)
  const fadeCredit = interpolate(frame, [24, 34], [0, 1], clamp01)
  const figSpring = spring({ frame: frame - 10, fps: FPS, config: theme.spring })

  const tickerText = 'BREAKING  ●  ZAVIYA  ●  '.repeat(8)

  return (
    <AbsoluteFill style={{ background: theme.bg }}>
      <BlurBg image={scene.image} blur={40} darken={0.55} />
      <PhotoPanel image={scene.image} index={scene.index} duration={scene.durationInFrames} height={layout.photoHeight} fadeStart={layout.gradientStart} />
      {/* dark area behind the text: lighter and smaller for short text */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: layout.gradientStart,
          width: W,
          height: 1920 - layout.gradientStart,
          background: `linear-gradient(180deg, rgba(${theme.bgRgb},0) 0, rgba(${theme.bgRgb},${layout.overlayOpacity}) 160px, rgba(${theme.bgRgb},${Math.min(0.97, layout.overlayOpacity + 0.14)}) 100%)`,
        }}
      />
      <Backdrop opacity={0.9} />
      {/* soft shade so the chrome stays readable on bright photos */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: 360, background: 'linear-gradient(180deg, rgba(0,0,0,0.55), rgba(0,0,0,0))' }} />

      {theme.ticker ? (
        <div style={{ position: 'absolute', left: 0, top: y(o.ticker), width: W, height: LAYOUT.tickerH, background: BRAND.red, overflow: 'hidden', display: 'flex', alignItems: 'center' }}>
          <div style={{ whiteSpace: 'nowrap', fontFamily: FONT.mono, fontWeight: 700, fontSize: 26, letterSpacing: 3, color: '#fff', transform: `translateX(${-(frame * 5) % 560}px)` }}>
            {tickerText}
          </div>
        </div>
      ) : null}

      {/* badge + chip */}
      <div style={{ position: 'absolute', left: SAFE.left, top: y(o.badge), display: 'flex', alignItems: 'center', gap: 16 }}>
        <div
          style={{
            height: BADGE_H,
            display: 'flex',
            alignItems: 'center',
            padding: '0 24px',
            background: theme.accent,
            color: theme.accentInk,
            fontFamily: FONT.mono,
            fontWeight: 700,
            fontSize: 32,
            transform: `scale(${interpolate(badge, [0, 1], [0.3, 1])})`,
            opacity: interpolate(frame, [4, 8], [0, 1], clamp01),
          }}
        >
          {scene.index}/{scene.total}
        </div>
        <CategoryChip label={scene.category.label} color={scene.category.color} delay={6} height={BADGE_H} />
      </div>

      {m.figure && scene.figure ? (
        <div style={{ position: 'absolute', left: SAFE.left, top: y(o.figure), width: CONTENT_W, opacity: interpolate(frame, [10, 16], [0, 1], clamp01), transform: `translateY(${interpolate(figSpring, [0, 1], [24, 0])}px)` }}>
          <div style={{ fontFamily: FONT.display, fontWeight: 900, fontSize: m.figure.size, lineHeight: 1.05, whiteSpace: 'nowrap', color: theme.figure, letterSpacing: '-0.02em' }}>
            <CountUp value={scene.figure.value} delay={10} duration={20} />
          </div>
          <div style={{ fontFamily: FONT.mono, fontWeight: 700, fontSize: 26, letterSpacing: 2, marginTop: 8, color: theme.figure }}>↳ {scene.figure.label}</div>
        </div>
      ) : null}

      <div style={{ position: 'absolute', left: SAFE.left, top: y(o.headline), width: CONTENT_W }}>
        <KineticHeadline text={scene.headline} highlight={scene.highlight} layout={m.headline} duration={scene.durationInFrames} startFrame={8} />
      </div>

      {m.urdu && scene.headlineUr ? (
        <div
          style={{
            position: 'absolute',
            left: SAFE.left,
            top: y(o.urdu),
            width: CONTENT_W,
            direction: 'rtl',
            textAlign: 'right',
            fontFamily: FONT.urdu,
            fontWeight: 700,
            fontSize: m.urdu.size,
            lineHeight: 1.9,
            color: theme.text,
            opacity: fadeUrdu,
          }}
        >
          {scene.headlineUr}
        </div>
      ) : null}

      {layout.dekShown && scene.dek ? (
        <div
          style={{
            position: 'absolute',
            left: SAFE.left,
            top: y(o.dek),
            width: CONTENT_W,
            fontFamily: FONT.inter,
            fontWeight: 700,
            fontSize: DEK_SIZE,
            lineHeight: 1.35,
            color: 'rgba(255,255,255,0.8)',
            opacity: fadeDek,
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {scene.dek}
        </div>
      ) : null}

      {scene.credit ? (
        <div
          style={{
            position: 'absolute',
            left: SAFE.left,
            top: y(o.credit),
            fontFamily: FONT.mono,
            fontWeight: 700,
            fontSize: 24,
            letterSpacing: 1,
            color: 'rgba(255,255,255,0.75)',
            opacity: fadeCredit,
          }}
        >
          {scene.credit}
        </div>
      ) : null}
    </AbsoluteFill>
  )
}
