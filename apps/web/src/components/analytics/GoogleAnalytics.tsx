'use client'

import { useEffect, useState } from 'react'
import Script from 'next/script'
import { HUMAN_EVENT } from './PageviewBeacon'

/** gtag.js, loaded only after our pageview endpoint says the visitor is a person (not a Meta link checker). */
export function GoogleAnalytics({ gaId }: { gaId: string }) {
  const [human, setHuman] = useState(false)
  useEffect(() => {
    if ((window as Window & { __zaviyaHuman?: boolean }).__zaviyaHuman) return setHuman(true)
    const on = () => setHuman(true)
    window.addEventListener(HUMAN_EVENT, on)
    return () => window.removeEventListener(HUMAN_EVENT, on)
  }, [])
  if (!human) return null
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} strategy="afterInteractive" />
      <Script id="ga-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${gaId}', { anonymize_ip: true });
        `}
      </Script>
    </>
  )
}
