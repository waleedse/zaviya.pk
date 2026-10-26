'use client'

import { Check, Image as ImageIcon, Link2, Share2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Locale } from '@zaviya/shared'
import { t } from '@/lib/i18n'
import { absoluteUrl } from '@/lib/seo'
import { cn } from '@/lib/utils'

const WA_PATH =
  'M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.8.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3 2.4 1 2.9.8 3.4.7.5-.1 1.7-.7 1.9-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.3zM12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2z'

export type ShareChannel = 'whatsapp' | 'facebook' | 'x' | 'copy' | 'native' | 'picture'

/** Counts a share click (first-party, no cookies) so we can see which button readers use. */
export function trackShare(channel: ShareChannel, path: string) {
  try {
    const body = JSON.stringify({ channel, path })
    if (!navigator.sendBeacon?.('/api/analytics/share', new Blob([body], { type: 'application/json' }))) {
      void fetch('/api/analytics/share', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true })
    }
  } catch {
    // tracking must never break sharing
  }
}

function useShare(title: string, path: string, locale: Locale) {
  const url = absoluteUrl(path)
  const [copied, setCopied] = useState(false)
  const [canShare, setCanShare] = useState(false)
  useEffect(() => setCanShare('share' in navigator), [])
  const utm = (s: string) => `${url}${url.includes('?') ? '&' : '?'}utm_source=${s}&utm_medium=share`
  return {
    canShare,
    copied,
    wa: `https://wa.me/?text=${encodeURIComponent(`${title}\n${utm('whatsapp')}`)}`,
    fb: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(utm('facebook'))}`,
    x: `https://twitter.com/intent/tweet?url=${encodeURIComponent(utm('x'))}&text=${encodeURIComponent(title)}`,
    copy: async () => {
      trackShare('copy', path)
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    },
    native: () => {
      trackShare('native', path)
      return navigator.share?.({ title, url }).catch(() => undefined)
    },
    track: (channel: ShareChannel) => trackShare(channel, path),
    picture: () => sharePicture(locale, title, path, url),
  }
}

/** /card/<slug>.png (Urdu: /card/ur/<slug>.png) for an article path like /business/<slug> */
export function cardPath(locale: Locale, path: string): string {
  const slug = path.split('?')[0].split('/').filter(Boolean).pop() ?? ''
  return locale === 'ur' ? `/card/ur/${slug}.png` : `/card/${slug}.png`
}

/** Shares the 1080x1350 headline card as a picture (phones: share sheet; desktop: downloads the PNG). */
async function sharePicture(locale: Locale, title: string, path: string, url: string) {
  trackShare('picture', path)
  try {
    const res = await fetch(cardPath(locale, path))
    if (!res.ok) throw new Error('card')
    const blob = await res.blob()
    const file = new File([blob], 'zaviya-news.png', { type: 'image/png' })
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title, text: `${title}\n${url}` })
      return
    }
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href
    a.download = 'zaviya-news.png'
    a.click()
    setTimeout(() => URL.revokeObjectURL(href), 10_000)
  } catch (e) {
    // A dismissed share sheet is not an error; anything else opens the picture so it can be saved by hand
    if (!(e instanceof DOMException && e.name === 'AbortError')) window.open(cardPath(locale, path), '_blank', 'noopener')
  }
}

const iconBtn = 'inline-flex h-10 w-10 items-center justify-center rounded-full border border-border text-fg-muted transition-colors hover:border-fg hover:text-fg'

export function ShareBar({ locale, title, path }: { locale: Locale; title: string; path: string }) {
  const d = t(locale)
  const s = useShare(title, path, locale)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={s.wa} onClick={() => s.track('whatsapp')} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-full bg-whatsapp px-4 text-sm font-semibold text-white hover:brightness-95">
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-current" aria-hidden>
          <path d={WA_PATH} />
        </svg>
        {d.share.whatsapp}
      </a>
      <a href={s.fb} onClick={() => s.track('facebook')} target="_blank" rel="noopener noreferrer" className={iconBtn} aria-label={d.share.facebook}>
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
          <path d="M14 8h3V4h-3c-2.8 0-5 2.2-5 5v2H7v4h2v9h4v-9h3l1-4h-4V9c0-.6.4-1 1-1z" />
        </svg>
      </a>
      <a href={s.x} onClick={() => s.track('x')} target="_blank" rel="noopener noreferrer" className={iconBtn} aria-label={d.share.x}>
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      </a>
      <button type="button" onClick={s.copy} className={iconBtn} aria-label={s.copied ? d.share.copied : d.share.copy}>
        {s.copied ? <Check className="h-4 w-4 text-up" /> : <Link2 className="h-4 w-4" />}
      </button>
      <button type="button" onClick={s.picture} className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold text-fg-muted transition-colors hover:border-fg hover:text-fg">
        <ImageIcon className="h-4 w-4" aria-hidden />
        {d.share.picture}
      </button>
      {s.canShare && (
        <button type="button" onClick={s.native} className={iconBtn} aria-label="Share">
          <Share2 className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

/** Phone-only bar above the bottom nav: WhatsApp is how most Pakistani readers share. */
export function MobileShareBar({ locale, title, path }: { locale: Locale; title: string; path: string }) {
  const d = t(locale)
  const s = useShare(title, path, locale)
  const [show, setShow] = useState(false)
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 240)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 flex items-center gap-2 border-t border-border bg-bg/95 px-4 py-2 backdrop-blur transition-transform duration-300 md:hidden',
        show ? 'translate-y-0' : 'translate-y-[150%]',
      )}
    >
      <a href={s.wa} onClick={() => s.track('whatsapp')} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-whatsapp text-sm font-semibold text-white">
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-current" aria-hidden>
          <path d={WA_PATH} />
        </svg>
        {locale === 'ur' ? 'WhatsApp par bhejein' : 'Share on WhatsApp'}
      </a>
      <a href={s.fb} onClick={() => s.track('facebook')} target="_blank" rel="noopener noreferrer" className={iconBtn} aria-label={d.share.facebook}>
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
          <path d="M14 8h3V4h-3c-2.8 0-5 2.2-5 5v2H7v4h2v9h4v-9h3l1-4h-4V9c0-.6.4-1 1-1z" />
        </svg>
      </a>
      <a href={s.x} onClick={() => s.track('x')} target="_blank" rel="noopener noreferrer" className={iconBtn} aria-label={d.share.x}>
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      </a>
      <button type="button" onClick={s.copy} className={iconBtn} aria-label={s.copied ? d.share.copied : d.share.copy}>
        {s.copied ? <Check className="h-4 w-4 text-up" /> : <Link2 className="h-4 w-4" />}
      </button>
      <button type="button" onClick={s.picture} className={iconBtn} aria-label={d.share.picture}>
        <ImageIcon className="h-4 w-4" />
      </button>
    </div>
  )
}
