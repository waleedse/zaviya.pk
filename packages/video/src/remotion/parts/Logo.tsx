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
  <div style={{ display: 'flex', alignItems: 'center', gap: 12 * scale, opacity, ...style }}>
    {/* The Z mark (site header, favicon, logo.png since 12 Nov); `arc` is kept for older callers */}
    <svg viewBox="0 0 44 44" width={44 * scale} height={44 * scale} aria-hidden="true" data-arc={arc}>
      <rect width="44" height="44" rx="10" fill="#047857" />
      <path d="M12.5 12.5h19M12.5 31.5h19" stroke="#fff" strokeWidth="4.4" strokeLinecap="round" />
      <path d="M31.5 12.5 12.5 31.5" stroke="#FBBF24" strokeWidth="4.4" strokeLinecap="round" />
    </svg>
    <div style={{ fontFamily: FONT.inter, fontWeight: 800, fontSize: 40 * scale, letterSpacing: -1 * scale, lineHeight: 0.9, color }}>
      zaviya
    </div>
  </div>
)
