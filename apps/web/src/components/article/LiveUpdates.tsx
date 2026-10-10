'use client'

import useSWR from 'swr'
import type { LiveUpdate, Locale } from '@zaviya/shared'
import { formatPktTime } from '@/lib/format'
import { t } from '@/lib/i18n'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function LiveUpdates({
  locale,
  updates: initial,
  pollUrl,
  isLive,
}: {
  locale: Locale
  updates: LiveUpdate[]
  pollUrl?: string
  isLive?: boolean
}) {
  const d = t(locale)
  const { data } = useSWR(isLive && pollUrl ? pollUrl : null, fetcher, { refreshInterval: 30_000, fallbackData: { updates: initial } })
  const updates = (data?.updates as LiveUpdate[] | undefined) ?? initial
  if (!updates.length) return null

  return (
    <section className="my-10">
      <h2 className="mb-4 font-display text-h2 font-semibold">{d.live}</h2>
      <ol className="space-y-4 border-s-2 border-breaking/30 ps-4">
        {updates.map((u, i) => (
          <li key={i} className="relative">
            <time className="text-sm font-medium text-breaking">{formatPktTime(u.at, locale)} PKT</time>
            <p className="mt-1">{u.text}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
