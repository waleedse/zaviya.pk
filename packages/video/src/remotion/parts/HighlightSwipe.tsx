import React from 'react'

/**
 * A coloured rectangle that sweeps in from the left behind its children, with the text turning to `ink` exactly where
 * the rectangle has passed: the ink layer (rectangle + dark text) is clipped by the same inset, so there is no flicker.
 * `progress` is 0..1; the rectangle ends exactly at the measured width of the children.
 */
export const HighlightSwipe: React.FC<{
  progress: number
  color: string
  ink: string
  padX?: number
  padY?: number
  children: React.ReactNode
  style?: React.CSSProperties
}> = ({ progress, color, ink, padX = 8, padY = 2, children, style }) => {
  const p = Math.min(1, Math.max(0, progress))
  const rightInset = (1 - p) * 100
  return (
    <span style={{ position: 'relative', display: 'inline-block', ...style }}>
      <span>{children}</span>
      <span
        style={{
          position: 'absolute',
          left: -padX,
          right: -padX,
          top: padY,
          bottom: padY,
          background: color,
          clipPath: `inset(0 ${rightInset}% 0 0)`,
          pointerEvents: 'none',
        }}
      >
        <span style={{ position: 'absolute', left: padX, top: -padY, color: ink, whiteSpace: 'nowrap' }}>{children}</span>
      </span>
    </span>
  )
}
