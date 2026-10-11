'use client'

import { RotateCcw } from 'lucide-react'
import { useState } from 'react'
import type { Locale } from '@zaviya/shared'

const PHASES = [
  { ar: 'سُبْحَانَ ٱللَّٰهِ', en: 'SubhanAllah', count: 33 },
  { ar: 'ٱلْحَمْدُ لِلَّٰهِ', en: 'Alhamdulillah', count: 33 },
  { ar: 'ٱللَّٰهُ أَكْبَرُ', en: 'Allahu Akbar', count: 34 },
]

/** Tasbeeh-e-Fatima counter: 33 + 33 + 34, then it starts again. */
export function Tasbeeh({ locale }: { locale: Locale }) {
  const [total, setTotal] = useState(0)
  const c = total % 100
  const phase = c < 33 ? 0 : c < 66 ? 1 : 2
  const inPhase = c - (phase === 0 ? 0 : phase === 1 ? 33 : 66)
  const p = PHASES[phase]!
  const circ = 2 * Math.PI * 88
  const tap = () => {
    setTotal((n) => n + 1)
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(8)
  }
  return (
    <section className="flex flex-col items-center gap-4 rounded-[22px] border border-accent-line bg-accent-soft p-6">
      <div className="flex w-full items-center justify-between">
        <h2 className="font-display text-xl font-extrabold">{locale === 'ur' ? 'ڈیجیٹل تسبیح' : 'Digital tasbeeh'}</h2>
        <button
          type="button"
          onClick={() => setTotal(0)}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-accent-line bg-surface px-3 text-[13px] font-bold text-accent"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          {locale === 'ur' ? 'دوبارہ' : 'Reset'}
        </button>
      </div>
      <button
        type="button"
        onClick={tap}
        aria-label={locale === 'ur' ? 'ایک گنیں' : `Count one. ${p.en}, ${inPhase} of ${p.count}`}
        className="relative flex h-48 w-48 items-center justify-center rounded-full bg-surface shadow-[0_16px_40px_-20px_rgb(4_120_87/0.6)] transition-transform active:scale-95"
      >
        <svg className="absolute inset-0" viewBox="0 0 200 200" aria-hidden>
          <circle cx="100" cy="100" r="88" fill="none" strokeWidth="10" className="stroke-accent-line" />
          <circle
            cx="100"
            cy="100"
            r="88"
            fill="none"
            strokeWidth="10"
            strokeLinecap="round"
            className="stroke-accent transition-[stroke-dasharray] duration-200"
            strokeDasharray={`${(circ * inPhase) / p.count} ${circ}`}
            transform="rotate(-90 100 100)"
          />
        </svg>
        <span className="relative flex flex-col items-center">
          <span lang="ar" className="font-urdu-sans text-[22px] leading-[1.6] text-accent">
            {p.ar}
          </span>
          <span className="font-display text-5xl font-extrabold leading-none tabular-nums" aria-live="polite">
            {inPhase}
          </span>
          <span className="text-[13px] text-fg-subtle">
            {locale === 'ur' ? 'از' : 'of'} {p.count}
          </span>
        </span>
      </button>
      <p className="text-[15px] font-bold text-accent">
        {p.en} · {locale === 'ur' ? 'کل' : 'Total'} {total}
      </p>
    </section>
  )
}
