import React from 'react'

export type Platform = 'instagram' | 'facebook' | 'youtube' | 'tiktok' | 'x'
export const PLATFORMS: Platform[] = ['instagram', 'facebook', 'youtube', 'tiktok', 'x']

/** Simple generic glyphs (rounded square + ring, play button, note, cross), drawn inline; no trademark artwork. */
export const SocialIcon: React.FC<{ platform: Platform; size?: number; color?: string }> = ({ platform, size = 56, color = '#fff' }) => {
  const common = { width: size, height: size, viewBox: '0 0 48 48', fill: 'none', stroke: color, strokeWidth: 4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (platform) {
    case 'instagram':
      return (
        <svg {...common}>
          <rect x="7" y="7" width="34" height="34" rx="10" />
          <circle cx="24" cy="24" r="8" />
          <circle cx="34" cy="14" r="1.6" fill={color} />
        </svg>
      )
    case 'facebook':
      return (
        <svg {...common}>
          <path d="M28 41V25h5.5l1-6H28v-4c0-2 1-3.2 3.4-3.2H34V6.6C33 6.4 31.5 6.2 30 6.2c-4.6 0-7.2 2.6-7.2 7.3V19H17.5v6h5.3v16" />
        </svg>
      )
    case 'youtube':
      return (
        <svg {...common}>
          <rect x="5" y="11" width="38" height="26" rx="8" />
          <path d="M20 17.5v13l11-6.5z" fill={color} />
        </svg>
      )
    case 'tiktok':
      return (
        <svg {...common}>
          <path d="M26 7v23.5a6.5 6.5 0 1 1-6.5-6.5" />
          <path d="M26 7c.6 5 3.8 8 9 8.3" />
        </svg>
      )
    case 'x':
      return (
        <svg {...common}>
          <path d="M9 9l30 30M39 9L9 39" />
        </svg>
      )
  }
}
