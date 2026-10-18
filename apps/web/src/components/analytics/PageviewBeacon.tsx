'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import type { Locale } from '@zaviya/shared'

export const HUMAN_EVENT = 'zaviya:human'

function markHuman() {
  const w = window as Window & { __zaviyaHuman?: boolean }
  if (w.__zaviyaHuman) return
  w.__zaviyaHuman = true
  window.dispatchEvent(new Event(HUMAN_EVENT))
}

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

    // The answer says whether this is a person; Google Analytics loads only then (see GoogleAnalytics)
    void fetch('/api/analytics/pageview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    })
      .then((r) => (r.ok ? (r.json() as Promise<{ human?: boolean }>) : { human: true }))
      .catch(() => ({ human: true }))
      .then((res) => {
        if (res.human !== false) markHuman()
      })
  }, [pathname, locale])

  return null
}
