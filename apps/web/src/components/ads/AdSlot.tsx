'use client'

import { useEffect, useRef } from 'react'
import type { Locale } from '@zaviya/shared'
import { t } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const SIZES = {
  leaderboard: { h: 90, minH: 'min-h-[90px]' },
  rectangle: { h: 250, minH: 'min-h-[250px]' },
  skyscraper: { h: 600, minH: 'min-h-[600px]' },
  native: { h: 120, minH: 'min-h-[120px]' },
} as const

declare global {
  interface Window {
    adsbygoogle?: unknown[]
  }
}

export function AdSlot({
  locale,
  size = 'rectangle',
  className,
  placement = 'default',
  adSlot,
}: {
  locale: Locale
  size?: keyof typeof SIZES
  className?: string
  /** Distinguishes multiple units on one page for AdSense */
  placement?: string
  /** Optional AdSense ad unit id (data-ad-slot) */
  adSlot?: string
}) {
  const d = t(locale)
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT
  const spec = SIZES[size]
  const pushed = useRef(false)
  useEffect(() => {
    if (!client || pushed.current) return
    try {
      window.adsbygoogle = window.adsbygoogle || []
      window.adsbygoogle.push({})
      pushed.current = true
    } catch {
      /* ad blocker or script not loaded yet */
    }
  }, [client])

  return (
    <aside className={cn('my-8 flex flex-col items-center', className)} aria-label={d.advertisement}>
      <span className="mb-1 text-[10px] uppercase tracking-wider text-fg-muted">{d.advertisement}</span>
      <div
        className={cn(
          'flex w-full max-w-[728px] items-center justify-center rounded-md border border-dashed border-border bg-surface-2/50',
          !client && spec.minH,
        )}
        style={client ? undefined : { minHeight: spec.h }}
      >
        {client ? (
          <ins
            className="adsbygoogle block w-full"
            data-ad-placement={placement}
            style={{ display: 'block', minHeight: spec.h }}
            data-ad-client={client}
            data-ad-slot={adSlot}
            data-ad-format={adSlot ? undefined : 'auto'}
            data-full-width-responsive={adSlot ? undefined : 'true'}
            data-adtest={process.env.NODE_ENV === 'development' ? 'on' : undefined}
          />
        ) : (
          <div className="px-4 text-center text-xs text-fg-muted">728×{spec.h}</div>
        )}
      </div>
    </aside>
  )
}
