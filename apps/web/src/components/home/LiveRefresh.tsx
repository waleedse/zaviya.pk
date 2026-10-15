'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import type { Locale } from '@zaviya/shared'

const STALE_MS = 60_000
const POLL_MS = 2 * 60_000

/**
 * Keeps the front page fresh without a reload: when the reader comes back to the tab (or every
 * two minutes while it is open) the server sends the newest render and React swaps it in place.
 * Scroll position and open widgets stay as they are.
 */
export function LiveRefresh({ locale }: { locale: Locale }) {
  const router = useRouter()
  const last = useRef(Date.now())
  const [notice, setNotice] = useState(false)

  useEffect(() => {
    const refresh = () => {
      last.current = Date.now()
      router.refresh()
      setNotice(true)
      setTimeout(() => setNotice(false), 3_000)
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - last.current > STALE_MS) refresh()
    }
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) refresh()
    }, POLL_MS)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [router])

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center transition-opacity duration-300 md:bottom-6 ${notice ? 'opacity-100' : 'opacity-0'}`}
    >
      {notice && (
        <span className="rounded-full bg-ink px-4 py-2 text-sm font-bold text-ink-fg shadow-lg">
          {locale === 'ur' ? 'تازہ ترین خبریں لوڈ ہو گئیں' : 'Front page updated'}
        </span>
      )}
    </div>
  )
}
