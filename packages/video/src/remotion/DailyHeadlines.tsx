import { linearTiming, TransitionSeries } from '@remotion/transitions'
import { fade } from '@remotion/transitions/fade'
import React, { useMemo } from 'react'
import { AbsoluteFill, Audio, Easing, interpolate, Sequence, staticFile, useCurrentFrame } from 'remotion'
import { SAFE } from '../constants'
import type { Scene, Timeline } from '../types'
import { FontGate } from './fonts'
import { Logo } from './parts/Logo'
import { ProgressBar } from './parts/ProgressBar'
import { yellowWipe } from './parts/YellowWipe'
import { Hook } from './scenes/Hook'
import { Numbers } from './scenes/Numbers'
import { QuickHits } from './scenes/QuickHits'
import { Outro } from './scenes/Outro'
import { Story } from './scenes/Story'
import { THEMES, ThemeCtx } from './theme'

const clamp01 = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

function renderScene(s: Scene) {
  switch (s.kind) {
    case 'hook':
      return <Hook scene={s} />
    case 'story':
      return <Story scene={s} />
    case 'numbers':
      return <Numbers scene={s} />
    case 'quickhits':
      return <QuickHits scene={s} />
    case 'outro':
      return <Outro scene={s} />
  }
}

/** Persistent logo, progress bar and (breaking) ticker, drawn above every scene. */
const Chrome: React.FC<{ timeline: Timeline; starts: number[] }> = ({ timeline, starts }) => {
  const frame = useCurrentFrame()
  const theme = THEMES[timeline.theme]
  const outroStart = starts[starts.length - 1]!
  const opacity =
    interpolate(frame, [15, 22], [0, 1], clamp01) * interpolate(frame, [outroStart, outroStart + 6], [1, 0], clamp01)

  const ranges: [number, number][] = []
  timeline.scenes.forEach((s, i) => {
    if (s.kind === 'story' || s.kind === 'quickhits') ranges.push([starts[i]!, starts[i + 1] ?? starts[i]! + s.durationInFrames])
  })

  return (
    <AbsoluteFill style={{ opacity }}>
      <ProgressBar ranges={ranges} top={120} />
      <div style={{ position: 'absolute', left: SAFE.left, top: 146 }}>
        <Logo scale={0.8} opacity={0.85} />
      </div>
    </AbsoluteFill>
  )
}

export const DailyHeadlines: React.FC<{ timeline: Timeline }> = ({ timeline }) => {
  const theme = THEMES[timeline.theme]
  const beat = Math.round((30 * 60) / timeline.track.bpm)
  const tf = timeline.transitionFrames

  const starts = useMemo(() => {
    const out: number[] = []
    let t = 0
    for (const s of timeline.scenes) {
      out.push(t)
      t += s.durationInFrames - tf
    }
    return out
  }, [timeline, tf])

  const total = timeline.totalFrames
  const presentation = theme.fade ? fade() : yellowWipe({ color: theme.band })

  return (
    <FontGate>
      <ThemeCtx.Provider value={{ theme, mode: timeline.mode, beat }}>
        <AbsoluteFill style={{ background: theme.bg }}>
          <TransitionSeries>
            {timeline.scenes.flatMap((s, i) => {
              const nodes = [
                <TransitionSeries.Sequence key={`s${i}`} durationInFrames={s.durationInFrames}>
                  {renderScene(s)}
                </TransitionSeries.Sequence>,
              ]
              if (i < timeline.scenes.length - 1) {
                nodes.push(
                  <TransitionSeries.Transition
                    key={`t${i}`}
                    presentation={presentation as never}
                    timing={linearTiming({ durationInFrames: tf, easing: theme.fade ? undefined : Easing.bezier(0.5, 0, 0.3, 1) })}
                  />,
                )
              }
              return nodes
            })}
          </TransitionSeries>

          <Chrome timeline={timeline} starts={starts} />

          <Audio
            src={staticFile(timeline.track.file)}
            volume={(f) =>
              interpolate(f, [0, 10], [0, 1], clamp01) * interpolate(f, [total - 20, total], [1, 0], clamp01)
            }
          />
          {theme.fade
            ? null
            : starts.slice(1).map((at, i) => (
                <Sequence key={i} from={at} durationInFrames={14}>
                  <Audio src={staticFile('audio/whoosh.wav')} volume={0.35} />
                </Sequence>
              ))}
        </AbsoluteFill>
      </ThemeCtx.Provider>
    </FontGate>
  )
}

