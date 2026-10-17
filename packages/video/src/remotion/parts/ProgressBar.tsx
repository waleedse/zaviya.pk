import React from 'react'
import { interpolate, useCurrentFrame } from 'remotion'
import { SAFE, W } from '../../constants'
import { useTheme } from '../theme'

/** Story-style progress: one segment per story, each fills linearly over its scene. */
export const ProgressBar: React.FC<{ ranges: [number, number][]; top?: number }> = ({ ranges, top = 120 }) => {
  const frame = useCurrentFrame()
  const { theme } = useTheme()
  const gap = 8
  const w = (W - SAFE.left - SAFE.right - gap * (ranges.length - 1)) / ranges.length
  return (
    <div style={{ position: 'absolute', top, left: SAFE.left, display: 'flex', gap }}>
      {ranges.map(([a, b], i) => {
        const p = interpolate(frame, [a, b], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
        return (
          <div key={i} style={{ width: w, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.28)', overflow: 'hidden' }}>
            <div style={{ width: `${p * 100}%`, height: '100%', background: theme.accent }} />
          </div>
        )
      })}
    </div>
  )
}
