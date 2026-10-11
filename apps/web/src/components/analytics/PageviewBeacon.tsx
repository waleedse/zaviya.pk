'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import type { Locale } from '@zaviya/shared'

export function PageviewBeacon({ locale }: { locale: Locale }) {
  const pathname = usePathname()
  const lastSent = useRef<string | null>(null)

  useEffect(() => {
    if (!pathname || pathname === lastSent.current) return
    // The external referrer only applies to the landing page; later soft navigations are internal.
    const isLanding = lastSent.current === null
    lastSent.current = pathname

    const utmSource = new URLSearchParams(window.location.search).get('utm_source') ?? undefined
    const body = JSON.stringify({
      path: pathname,
      locale,
      referrer: isLanding ? document.referrer || undefined : window.location.origin + '/',
      utmSource: isLanding ? utmSource : undefined,
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
