import { fitText } from '@remotion/layout-utils'
import React from 'react'
import { AbsoluteFill } from 'remotion'
import { SAFE, W } from '../constants'
import type { StoryScene, Timeline } from '../types'
import { Logo } from './parts/Logo'
import { BlurBg, PhotoPanel } from './parts/PhotoPanel'
import { FONT, FontGate } from './fonts'
import { THEMES, ThemeCtx } from './theme'

export const Cover: React.FC<{ timeline: Timeline }> = ({ timeline }) => {
  const theme = THEMES[timeline.theme]
  const stories = timeline.scenes.filter((s): s is StoryScene => s.kind === 'story')
  const lead = stories[0]!
  const maxW = W - SAFE.left - SAFE.right
  const line = fitText({ text: timeline.coverLine, withinWidth: maxW, fontFamily: 'Unbounded', fontWeight: '900' }).fontSize
  const size = Math.min(92, line)
  return (
    <FontGate>
      <ThemeCtx.Provider value={{ theme, mode: timeline.mode, beat: 15 }}>
        <AbsoluteFill style={{ background: theme.bg }}>
          <BlurBg image={lead.image} blur={40} darken={0.55} />
          <AbsoluteFill style={{ background: `linear-gradient(180deg, rgba(${theme.bgRgb},0) 0%, rgba(${theme.bgRgb},0.6) 700px, rgba(${theme.bgRgb},0.95) 1300px)` }} />
          <PhotoPanel image={lead.image} index={1} duration={1} height={1000} still />
          <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: 360, background: 'linear-gradient(180deg, rgba(0,0,0,0.55), rgba(0,0,0,0))' }} />
          <div style={{ position: 'absolute', left: SAFE.left, top: 200 }}>
            <Logo scale={1.2} opacity={1} />
          </div>
          {timeline.mode === 'breaking' ? (
            <div style={{ position: 'absolute', left: SAFE.left, top: 1040, display: 'inline-block', background: theme.accent, color: '#fff', fontFamily: FONT.mono, fontWeight: 700, fontSize: 34, letterSpacing: 3, padding: '8px 22px' }}>BREAKING</div>
          ) : null}
          <div style={{ position: 'absolute', left: SAFE.left, top: 1130, width: maxW, fontFamily: FONT.display, fontWeight: 900, fontSize: size, letterSpacing: '-0.02em', whiteSpace: 'nowrap', color: theme.text }}>
            {timeline.coverLine}
          </div>
          <div style={{ position: 'absolute', left: SAFE.left, top: 1130 + size * 1.5 }}>
            <div style={{ display: 'inline-block', background: theme.accent, color: theme.accentInk, fontFamily: FONT.display, fontWeight: 900, fontSize: 64, padding: '10px 28px' }}>
              {timeline.storyCount === 1 ? 'LIVE UPDATE' : `${timeline.storyCount} STORIES`}
            </div>
          </div>
        </AbsoluteFill>
      </ThemeCtx.Provider>
    </FontGate>
  )
}
