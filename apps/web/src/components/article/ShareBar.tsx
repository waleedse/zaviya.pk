'use client'

import { Check, Copy, Share2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Locale } from '@zaviya/shared'
import { Button } from '@/components/ui/button'
import { t } from '@/lib/i18n'
import { absoluteUrl } from '@/lib/seo'

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

export function ShareBar({ locale, title, path }: { locale: Locale; title: string; path: string }) {
  const d = t(locale)
  const url = absoluteUrl(path)
  const [copied, setCopied] = useState(false)
  const [canShare, setCanShare] = useState(false)
  useEffect(() => setCanShare(typeof navigator !== 'undefined' && 'share' in navigator), [])

  const copy = async () => {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const shareNative = async () => {
    if (navigator.share) {
      await navigator.share({ title, url })
    }
  }

  const wa = `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`
  const fb = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`
  const x = `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild variant="default" size="sm" className="bg-[#25D366] text-white hover:bg-[#25D366]/90">
        <a href={wa} target="_blank" rel="noopener noreferrer">
          {d.share.whatsapp}
        </a>
      </Button>
      <Button asChild variant="outline" size="sm">
        <a href={fb} target="_blank" rel="noopener noreferrer">
          <span className="me-1 text-xs font-bold">f</span>
          {d.share.facebook}
        </a>
      </Button>
      <Button asChild variant="outline" size="sm">
        <a href={x} target="_blank" rel="noopener noreferrer">
          <XIcon className="me-1 h-4 w-4" />
          {d.share.x}
        </a>
      </Button>
      <Button variant="outline" size="sm" onClick={copy}>
        {copied ? <Check className="me-1 h-4 w-4" /> : <Copy className="me-1 h-4 w-4" />}
        {copied ? d.share.copied : d.share.copy}
      </Button>
      {canShare && (
        <Button variant="ghost" size="sm" onClick={shareNative}>
          <Share2 className="me-1 h-4 w-4" />
          Share
        </Button>
      )}
    </div>
  )
}
