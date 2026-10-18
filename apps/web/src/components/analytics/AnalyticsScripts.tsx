import Script from 'next/script'
import { GoogleAnalytics } from './GoogleAnalytics'

export function AnalyticsScripts() {
  const plausible = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN
  const gaId = process.env.NEXT_PUBLIC_GA_ID

  if (!plausible && !gaId) return null

  return (
    <>
      {plausible ? (
        <Script
          defer
          data-domain={plausible}
          src="https://plausible.io/js/script.js"
          strategy="afterInteractive"
        />
      ) : null}
      {gaId ? <GoogleAnalytics gaId={gaId} /> : null}
    </>
  )
}
