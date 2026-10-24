import React from 'react'
import { AbsoluteFill, Audio, Easing, Img, interpolate, Sequence, spring, staticFile, useCurrentFrame } from 'remotion'
import { BRAND, FPS, SAFE } from '../constants'
import { NARRATED_LEAD_IN_FRAMES, type NarratedBeat, type NarratedTimeline } from '../narrated'
import { FONT, FontGate } from './fonts'
import { Logo } from './parts/Logo'
import { ProgressBar } from './parts/ProgressBar'
import { THEMES, ThemeCtx } from './theme'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
const FADE = 8

function src(image: string): string {
  return /^(https?:|data:|\/)/.test(image) ? image : staticFile(`narrated/${image}`)
}

/** Slow drift on the picture; neighbouring beats drift differently. */
function drift(kind: number, p: number): { scale: number; x: number; y: number } {
  switch (kind) {
    case 0:
      return { scale: 1.05 + 0.1 * p, x: 0, y: 0 }
    case 1:
      return { scale: 1.15 - 0.09 * p, x: 0, y: 0 }
    case 2:
      return { scale: 1.12, x: -3 + 6 * p, y: 0 }
    default:
      return { scale: 1.12, x: 0, y: 3 - 6 * p }
  }
}

const BeatLayer: React.FC<{ beat: NarratedBeat; seqFrom: number; accent: string; layout: 'card' | 'full' }> = ({ beat, seqFrom, accent, layout }) => {
  const local = useCurrentFrame()
  const abs = local + seqFrom
  const fadeIn = interpolate(local, [0, FADE], [0, 1], { ...clamp, easing: Easing.out(Easing.quad) })
  const p = interpolate(abs, [beat.from, beat.from + beat.durationInFrames], [0, 1], clamp)
  const d = drift(beat.drift, p)
  const chunk = [...beat.chunks].reverse().find((c) => c.from <= abs) ?? beat.chunks[0]
  const pop = chunk ? spring({ frame: abs - chunk.from, fps: FPS, config: { damping: 16, stiffness: 190, mass: 0.6 } }) : 1

  if (layout === 'full') {
    // a vertical photograph filling the screen, drifting slowly, with the words on a dark fade at the bottom
    const fd = { scale: 1.08 + 0.14 * p, x: beat.drift % 2 === 0 ? -2 + 4 * p : 2 - 4 * p, y: beat.drift < 2 ? 1.5 - 3 * p : -1.5 + 3 * p }
    return (
      <AbsoluteFill style={{ opacity: fadeIn, background: '#05080f' }}>
        <Img src={src(beat.image)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: `translate(${fd.x}%, ${fd.y}%) scale(${fd.scale})`, filter: 'saturate(1.08) contrast(1.04)' }} />
        <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(3,6,12,0.62) 0%, rgba(3,6,12,0) 20%, rgba(3,6,12,0) 42%, rgba(3,6,12,0.72) 66%, rgba(3,6,12,0.95) 100%)' }} />
        {beat.credit ? (
          <div style={{ position: 'absolute', right: SAFE.right, top: 150, padding: '6px 14px', borderRadius: 8, background: 'rgba(0,0,0,0.5)', color: 'rgba(255,255,255,0.85)', fontFamily: FONT.mono, fontSize: 22, letterSpacing: 1 }}>{beat.credit}</div>
        ) : null}
        {beat.kicker ? (
          <div style={{ position: 'absolute', left: SAFE.left, right: SAFE.right, top: 1262, textAlign: 'center', direction: 'rtl' }}>
            <span style={{ display: 'inline-block', padding: '2px 28px 8px', borderRadius: 14, background: accent, color: '#0B1630', fontFamily: FONT.urdu, fontSize: 40, lineHeight: 1.9 }}>{beat.kicker}</span>
          </div>
        ) : null}
        {chunk ? (
          <div style={{ position: 'absolute', left: SAFE.left, right: SAFE.right, top: beat.kicker ? 1368 : 1330, height: 330, display: 'flex', alignItems: 'center', justifyContent: 'center', direction: 'rtl' }}>
            <div
              style={{
                fontFamily: FONT.urdu,
                fontSize: 92,
                lineHeight: 1.9,
                color: '#fff',
                textAlign: 'center',
                textShadow: '0 4px 30px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.7)',
                opacity: interpolate(pop, [0, 1], [0.2, 1]),
                transform: `translateY(${interpolate(pop, [0, 1], [22, 0])}px) scale(${interpolate(pop, [0, 1], [0.94, 1])})`,
              }}
            >
              {chunk.text}
            </div>
          </div>
        ) : null}
      </AbsoluteFill>
    )
  }

  return (
    <AbsoluteFill style={{ opacity: fadeIn }}>
      <Img src={src(beat.image)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(38px) brightness(0.42) saturate(1.2)', transform: 'scale(1.25)' }} />
      <div style={{ position: 'absolute', left: 48, top: 330, width: 984, height: 1010, borderRadius: 36, overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,0.55)', background: '#000' }}>
        <Img src={src(beat.image)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `translate(${d.x}%, ${d.y}%) scale(${d.scale})` }} />
        {beat.credit ? (
          <div style={{ position: 'absolute', left: 20, bottom: 20, padding: '8px 16px', borderRadius: 10, background: 'rgba(0,0,0,0.6)', color: '#fff', fontFamily: FONT.mono, fontSize: 24, letterSpacing: 1 }}>
            {beat.credit}
          </div>
        ) : null}
      </div>
      {beat.kicker ? (
        <div style={{ position: 'absolute', left: SAFE.left, right: SAFE.right, top: 1368, textAlign: 'center', direction: 'rtl' }}>
          <span style={{ display: 'inline-block', padding: '2px 26px 8px', borderRadius: 14, background: accent, color: '#0B1630', fontFamily: FONT.urdu, fontSize: 38, lineHeight: 1.9 }}>{beat.kicker}</span>
        </div>
      ) : null}
      {chunk ? (
        <div style={{ position: 'absolute', left: SAFE.left, right: SAFE.right, top: beat.kicker ? 1460 : 1420, height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', direction: 'rtl' }}>
          <div
            style={{
              fontFamily: FONT.urdu,
              fontSize: 82,
              lineHeight: 1.9,
              color: '#fff',
              textAlign: 'center',
              textShadow: '0 4px 28px rgba(0,0,0,0.85), 0 0 4px rgba(0,0,0,0.6)',
              opacity: interpolate(pop, [0, 1], [0.2, 1]),
              transform: `translateY(${interpolate(pop, [0, 1], [18, 0])}px) scale(${interpolate(pop, [0, 1], [0.95, 1])})`,
            }}
          >
            {chunk.text}
          </div>
        </div>
      ) : null}
    </AbsoluteFill>
  )
}

const EndCard: React.FC<{ timeline: NarratedTimeline; accent: string }> = ({ timeline, accent }) => {
  const f = useCurrentFrame()
  const o = interpolate(f, [0, 12], [0, 1], clamp)
  const s = spring({ frame: f, fps: FPS, config: { damping: 14, stiffness: 150 } })
  return (
    <AbsoluteFill style={{ opacity: o, background: BRAND.navy, alignItems: 'center', justifyContent: 'center', gap: 60 }}>
      <div style={{ transform: `scale(${interpolate(s, [0, 1], [0.85, 1])})` }}>
        <Logo scale={2.2} opacity={1} arc={accent} />
      </div>
      <div style={{ fontFamily: FONT.urdu, fontSize: 70, lineHeight: 1.9, color: '#fff', direction: 'rtl', textAlign: 'center', padding: '0 80px' }}>{timeline.cta}</div>
      <div style={{ fontFamily: FONT.mono, fontSize: 46, color: accent, letterSpacing: 2 }}>{timeline.site.toUpperCase()}</div>
    </AbsoluteFill>
  )
}

export const Narrated: React.FC<{ timeline: NarratedTimeline }> = ({ timeline }) => {
  const theme = THEMES[timeline.theme]
  const total = timeline.totalFrames
  const ranges: [number, number][] = timeline.beats.map((b, i) => [i === 0 ? 0 : b.from, b.from + b.durationInFrames])
  return (
    <FontGate>
      <ThemeCtx.Provider value={{ theme, mode: 'normal', beat: 15 }}>
        <AbsoluteFill style={{ background: BRAND.navy }}>
          {timeline.beats.map((b, i) => {
            const from = i === 0 ? 0 : b.from
            // every beat (the last one too) runs a little into the next scene, so the fade never dips to an empty screen
            const dur = b.from + b.durationInFrames - from + (i < timeline.beats.length - 1 ? FADE : 12)
            return (
              <Sequence key={i} from={from} durationInFrames={dur}>
                <BeatLayer beat={b} seqFrom={from} accent={theme.accent} layout={timeline.layout ?? 'card'} />
              </Sequence>
            )
          })}
          <Sequence from={timeline.endFrom}>
            <EndCard timeline={timeline} accent={theme.accent} />
          </Sequence>
          <AbsoluteFill style={{ opacity: interpolate(useCurrentFrame(), [15, 22, timeline.endFrom, timeline.endFrom + 6], [0, 1, 1, 0], clamp) }}>
            <ProgressBar ranges={ranges} top={120} />
            <div style={{ position: 'absolute', left: SAFE.left, top: 146 }}>
              <Logo scale={0.8} opacity={0.9} />
            </div>
          </AbsoluteFill>
          <Sequence from={NARRATED_LEAD_IN_FRAMES}>
            <Audio src={staticFile(`narrated/${timeline.audio}`)} volume={1} />
          </Sequence>
          {timeline.music ? (
            <Audio src={staticFile(timeline.music)} loop volume={(f) => 0.09 * interpolate(f, [0, 15], [0, 1], clamp) * interpolate(f, [total - 30, total], [1, 0], clamp)} />
          ) : null}
        </AbsoluteFill>
      </ThemeCtx.Provider>
    </FontGate>
  )
}
