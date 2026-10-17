import React from 'react'
import { useCurrentFrame } from 'remotion'
import { H, W } from '../../constants'
import { useTheme } from '../theme'

/** Animated dot-matrix grid for the tech theme (drifts slowly with the frame); nothing for other themes. */
export const Backdrop: React.FC<{ opacity?: number }> = ({ opacity = 1 }) => {
  const frame = useCurrentFrame()
  const { theme } = useTheme()
  if (!theme.grid) return null
  const size = 72
  const off = (frame * 0.7) % size
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', opacity }}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: W,
          height: H + size,
          transform: `translateY(${off - size}px)`,
          backgroundImage: `linear-gradient(rgba(34,211,238,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.16) 1px, transparent 1px), radial-gradient(circle, rgba(123,77,255,0.5) 2px, transparent 2.5px)`,
          backgroundSize: `${size}px ${size}px, ${size}px ${size}px, ${size}px ${size}px`,
        }}
      />
    </div>
  )
}
