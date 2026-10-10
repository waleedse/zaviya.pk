export function Sparkline({ values, className, positive }: { values: number[]; className?: string; positive?: boolean }) {
  if (!values.length) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const w = 80
  const h = 28
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1 || 1)) * w
      const y = h - ((v - min) / range) * h
      return `${x},${y}`
    })
    .join(' ')

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} aria-hidden width={w} height={h}>
      <polyline fill="none" stroke="currentColor" strokeWidth="1.5" className={positive ? 'text-up' : 'text-down'} points={pts} />
    </svg>
  )
}
