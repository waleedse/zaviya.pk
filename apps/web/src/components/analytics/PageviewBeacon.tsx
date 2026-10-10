'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import type { Locale } from '@zaviya/shared'

export function PageviewBeacon({ locale }: { locale: Locale }) {
  const pathname = usePathname()
  const lastSent = useRef<string | null>(null)

  useEffect(() => {
    if (!pathname || pathname === lastSent.current) return
    lastSent.current = pathname

    const body = JSON.stringify({
      path: pathname,
      locale,
      referrer: typeof document !== 'undefined' ? document.referrer || undefined : undefined,
    })

    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/analytics/pageview', new Blob([body], { type: 'application/json' }))
      return
    }

    void fetch('/api/analytics/pageview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    })
  }, [pathname, locale])

  return null
}
