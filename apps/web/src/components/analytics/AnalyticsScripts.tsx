import Script from 'next/script'

/** Zaviya's Google Analytics 4 property; NEXT_PUBLIC_GA_ID overrides it (set it empty to switch GA off). */
export const DEFAULT_GA_ID = 'G-XEDRHVVQS9'

export function AnalyticsScripts() {
  const plausible = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN
  const gaId = process.env.NEXT_PUBLIC_GA_ID ?? DEFAULT_GA_ID

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
      {gaId ? (
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
      ) : null}
    </>
  )
}
