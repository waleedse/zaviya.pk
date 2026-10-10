'use client'

import type { Locale } from '@zaviya/shared'
import { timeAgo } from '@/lib/format'
import { useEffect, useState } from 'react'

export function TimeAgo({ iso, locale, className }: { iso: string; locale: Locale; className?: string }) {
  const [label, setLabel] = useState(() => timeAgo(iso, locale))
  useEffect(() => {
    setLabel(timeAgo(iso, locale))
    const id = setInterval(() => setLabel(timeAgo(iso, locale)), 60_000)
    return () => clearInterval(id)
  }, [iso, locale])
  return (
    <time dateTime={iso} className={className} suppressHydrationWarning>
      {label}
    </time>
  )
}
