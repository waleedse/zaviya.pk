import React from 'react'
import { Img, interpolate, useCurrentFrame } from 'remotion'
import { H, W } from '../../constants'
import { useTheme } from '../theme'
import { resolveImage } from '../util'

/**
 * Full-frame blurred copy of the photo. The blur is done on a quarter-size copy that is scaled up, which looks the
 * same and renders much faster.
 */
export const BlurBg: React.FC<{ image: string; blur?: number; darken?: number; scaleFrom?: number; scaleTo?: number; duration?: number }> = ({
  image,
  blur = 40,
  darken = 0.55,
  scaleFrom = 1.1,
  scaleTo = 1.1,
  duration = 100,
}) => {
  const frame = useCurrentFrame()
  const { theme } = useTheme()
  const s = interpolate(frame, [0, duration], [scaleFrom, scaleTo], { extrapolateRight: 'clamp' })
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: theme.bg }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: W / 4, height: H / 4, transform: `translate(${(-(s - 1) * W) / 2}px, ${(-(s - 1) * H) / 2}px) scale(${4 * s})`, transformOrigin: '0 0' }}>
        <Img
          src={resolveImage(image)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', filter: `blur(${blur / 4}px) saturate(${theme.saturate})` }}
        />
      </div>
      <div style={{ position: 'absolute', inset: 0, background: theme.tint }} />
      <div style={{ position: 'absolute', inset: 0, background: `rgba(${theme.bgRgb},${darken})` }} />
    </div>
  )
}

/**
 * The sharp photo in a panel at the top, with Ken Burns zoom and pan, fading into the background at the bottom.
 * The image is overscanned (wider box plus a base zoom) so the pan can never expose an edge.
 */
export const PhotoPanel: React.FC<{
  image: string
  index: number
  duration: number
  height?: number
  /** y where the bottom fade starts (defaults to 200 px above the bottom) */
  fadeStart?: number
  still?: boolean
}> = ({ image, index, duration, height = 860, fadeStart, still = false }) => {
  const frame = useCurrentFrame()
  const { theme } = useTheme()
  const t = interpolate(frame, [0, duration], [0, 1], { extrapolateRight: 'clamp' })
  const scale = (still ? 1 : 1 + 0.1 * t) * 1.04
  const dir = index % 2 === 0 ? 1 : -1
  const pan = still ? 0 : dir * interpolate(t, [0, 1], [-40, 40])
  const start = Math.min(fadeStart ?? height - 200, height - 40)
  const mask = `linear-gradient(to bottom, #000 0, #000 ${start}px, transparent ${height}px)`
  const over = Math.round(W * 0.06)
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: W, height, overflow: 'hidden', WebkitMaskImage: mask, maskImage: mask }}>
      <Img
        src={resolveImage(image)}
        style={{
          position: 'absolute',
          left: -over,
          top: 0,
          width: W + over * 2,
          height,
          objectFit: 'cover',
          transform: `translateX(${pan}px) scale(${scale})`,
          filter: `saturate(${theme.saturate})`,
        }}
      />
      <div style={{ position: 'absolute', inset: 0, background: theme.tint }} />
    </div>
  )
}
