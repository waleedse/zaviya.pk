import React from 'react'
import { Easing, interpolate, useCurrentFrame } from 'remotion'

/** Splits "Rs 432,151" into prefix "Rs ", number 432151, suffix "". Only the number counts up. */
export function splitNumber(value: string) {
  const m = /(\d[\d,]*(?:\.\d+)?)/.exec(value)
  if (!m) return null
  const raw = m[1]!
  return {
    prefix: value.slice(0, m.index),
    suffix: value.slice(m.index + raw.length),
    target: parseFloat(raw.replace(/,/g, '')),
    decimals: (raw.split('.')[1] ?? '').length,
    grouping: raw.includes(','),
  }
}

export function formatCount(value: string, p: number): string {
  const s = splitNumber(value)
  if (!s) return value
  const n = (s.target * p).toLocaleString('en-US', {
    minimumFractionDigits: s.decimals,
    maximumFractionDigits: s.decimals,
    useGrouping: s.grouping,
  })
  return `${s.prefix}${n}${s.suffix}`
}

export const CountUp: React.FC<{ value: string; delay?: number; duration?: number; style?: React.CSSProperties }> = ({
  value,
  delay = 0,
  duration = 20,
  style,
}) => {
  const frame = useCurrentFrame()
  const p = interpolate(frame - delay, [0, duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  })
  return <span style={{ fontVariantNumeric: 'tabular-nums', ...style }}>{formatCount(value, p)}</span>
}
