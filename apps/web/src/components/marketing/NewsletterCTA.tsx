'use client'

import { useState } from 'react'
import type { Locale } from '@zaviya/shared'
import { Button } from '@/components/ui/button'
import { t } from '@/lib/i18n'

type State = 'idle' | 'sending' | 'sent' | 'invalid' | 'limited' | 'error'

export function NewsletterCTA({ locale, source = 'site' }: { locale: Locale; source?: string }) {
  const d = t(locale)
  const isUr = locale === 'ur'
  const [state, setState] = useState<State>('idle')

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setState('sending')
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: form.get('email'), website: form.get('website'), locale, source }),
      })
      setState(res.ok ? 'sent' : res.status === 422 ? 'invalid' : res.status === 429 ? 'limited' : 'error')
    } catch {
      setState('error')
    }
  }

  const message: Record<Exclude<State, 'idle' | 'sending'>, string> = {
    sent: isUr ? 'اپنا ان باکس دیکھیں: تصدیق کا لنک بھیج دیا گیا ہے۔' : 'Check your inbox: we sent a link to confirm your address.',
    invalid: isUr ? 'براہ کرم درست ای میل لکھیں۔' : 'Please enter a valid email address.',
    limited: isUr ? 'بہت زیادہ کوششیں۔ کچھ دیر بعد دوبارہ کوشش کریں۔' : 'Too many tries. Please try again later.',
    error: isUr ? 'کچھ گڑبڑ ہو گئی۔ دوبارہ کوشش کریں۔' : 'Something went wrong. Please try again.',
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface-2/50 p-8">
      <h2 className="font-display text-h3 font-semibold">{d.newsletter.title}</h2>
      <p className="mt-2 text-sm text-fg-muted">{d.newsletter.desc}</p>
      <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={onSubmit}>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          aria-label="Email"
          placeholder="you@example.com"
          className="h-11 flex-1 rounded-[var(--radius-input)] border border-border bg-surface px-4 text-base"
          dir="ltr"
        />
        <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
        <Button type="submit" disabled={state === 'sending' || state === 'sent'}>
          {d.newsletter.cta}
        </Button>
      </form>
      {state !== 'idle' && state !== 'sending' && (
        <p role="status" className="mt-3 text-sm text-fg-muted">
          {message[state]}
        </p>
      )}
    </div>
  )
}
