import React from 'react'
import { BRAND } from '../../constants'
import { FONT } from '../fonts'

export const Logo: React.FC<{ scale?: number; opacity?: number; color?: string; arc?: string; style?: React.CSSProperties }> = ({
  scale = 0.8,
  opacity = 0.85,
  color = '#fff',
  arc = BRAND.yellow,
  style,
}) => (
  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 * scale, opacity, ...style }}>
    <svg viewBox="0 0 46 40" width={44 * scale} height={38 * scale} aria-hidden="true">
      <path d="M3 37 L43 37 M3 37 L33 5" stroke={color} strokeWidth="4.5" fill="none" />
      <path d="M19 37 A16 16 0 0 0 14 25" stroke={arc} strokeWidth="4.5" fill="none" />
    </svg>
    <div style={{ fontFamily: FONT.inter, fontWeight: 800, fontSize: 40 * scale, letterSpacing: -1 * scale, lineHeight: 0.9, color }}>
      zaviya
    </div>
  </div>
)
