import React from 'react'
import { interpolate, spring, useCurrentFrame } from 'remotion'
import { FPS } from '../../constants'
import { FONT } from '../fonts'
import { useTheme } from '../theme'
import { inkOn } from '../util'

export const CategoryChip: React.FC<{ label: string; color: string; delay?: number; height?: number }> = ({
  label,
  color,
  delay = 6,
  height = 60,
}) => {
  const frame = useCurrentFrame()
  const { theme } = useTheme()
  const p = spring({ frame: frame - delay, fps: FPS, config: theme.spring })
  const x = interpolate(p, [0, 1], [-40, 0])
  const opacity = interpolate(frame - delay, [0, 6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <div
      style={{
        height,
        display: 'flex',
        alignItems: 'center',
        padding: '0 26px',
        background: color,
        color: inkOn(color),
        fontFamily: FONT.mono,
        fontWeight: 700,
        fontSize: 30,
        letterSpacing: 2,
        textTransform: 'uppercase',
        transform: `translateX(${x}px)`,
        opacity,
      }}
    >
      {label}
    </div>
  )
}
