'use client'

import { Calculator, Minus, Plus } from 'lucide-react'
import { useState } from 'react'
import type { Locale } from '@zaviya/shared'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

const TOLA_GRAMS = 11.6638
const UNITS = [
  { key: 'tola', en: 'Tola', ur: 'تولہ', grams: TOLA_GRAMS },
  { key: '10g', en: '10 g', ur: '10 گرام', grams: 10 },
  { key: 'gram', en: 'Gram', ur: 'گرام', grams: 1 },
] as const

/** Estimate the value of gold you own from today's 24K tola rate (before making charges and tax). */
export function GoldCalculator({ locale, rate24kTola }: { locale: Locale; rate24kTola: number }) {
  const isUr = locale === 'ur'
  const [karat, setKarat] = useState(22)
  const [unit, setUnit] = useState<(typeof UNITS)[number]['key']>('tola')
  const [weight, setWeight] = useState('1')
  const w = Math.max(0, Number(weight) || 0)
  const perGram = (rate24kTola / TOLA_GRAMS) * (karat / 24)
  const grams = w * UNITS.find((u) => u.key === unit)!.grams
  const value = Math.round(grams * perGram)
  const step = (d: number) => setWeight(String(Math.max(0, Math.round(((Number(weight) || 0) + d) * 10) / 10)))
  const opt = (on: boolean) =>
    cn('h-11 rounded-xl border-[1.5px] text-[15px] font-extrabold transition-colors', on ? 'border-amber-700 bg-amber-700 text-white' : 'border-amber-300 bg-surface text-amber-900 dark:text-amber-200')

  return (
    <section className="mt-8 rounded-[22px] border border-amber-200 bg-amber-soft p-5 md:p-7 dark:border-amber-900">
      <h2 className="mb-5 flex items-center gap-2.5 font-display text-2xl font-extrabold">
        <span className="icon-tile h-9 w-9 bg-amber-600 text-white">
          <Calculator className="h-[18px] w-[18px]" aria-hidden />
        </span>
        {isUr ? 'آپ کے سونے کی قیمت کیا ہے؟' : 'What is your gold worth today?'}
      </h2>
      <div className="grid gap-5 md:grid-cols-3">
        <div>
          <p className="eyebrow mb-2 text-amber-800 dark:text-amber-300">{isUr ? 'قیراط' : 'Purity'}</p>
          <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label={isUr ? 'قیراط' : 'Purity'}>
            {[24, 22, 21, 18].map((k) => (
              <button key={k} type="button" role="radio" aria-checked={karat === k} onClick={() => setKarat(k)} className={opt(karat === k)}>
                {k}K
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="eyebrow mb-2 text-amber-800 dark:text-amber-300">{isUr ? 'اکائی' : 'Unit'}</p>
          <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label={isUr ? 'اکائی' : 'Unit'}>
            {UNITS.map((u) => (
              <button key={u.key} type="button" role="radio" aria-checked={unit === u.key} onClick={() => setUnit(u.key)} className={opt(unit === u.key)}>
                {isUr ? u.ur : u.en}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="gold-weight" className="eyebrow mb-2 block text-amber-800 dark:text-amber-300">
            {isUr ? 'وزن' : 'Weight'}
          </label>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => step(-0.5)} aria-label={isUr ? 'کم کریں' : 'Decrease'} className="inline-flex h-11 w-11 items-center justify-center rounded-xl border-[1.5px] border-amber-300 bg-surface">
              <Minus className="h-4 w-4" aria-hidden />
            </button>
            <input
              id="gold-weight"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.5"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="h-11 min-w-0 flex-1 rounded-xl border-[1.5px] border-amber-300 bg-surface text-center text-lg font-extrabold outline-none focus:border-amber-600"
            />
            <button type="button" onClick={() => step(0.5)} aria-label={isUr ? 'زیادہ کریں' : 'Increase'} className="inline-flex h-11 w-11 items-center justify-center rounded-xl border-[1.5px] border-amber-300 bg-surface">
              <Plus className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-t border-dashed border-amber-300 pt-5">
        <div>
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            {isUr ? `${w} ${UNITS.find((u) => u.key === unit)!.ur} ${karat} قیراط کی اندازاً قیمت` : `Estimated value of ${w} ${UNITS.find((u) => u.key === unit)!.en.toLowerCase()} of ${karat}K`}
          </p>
          <p dir="ltr" className="font-display text-[2.6rem] font-extrabold leading-tight tabular-nums rtl:text-end" aria-live="polite">
            Rs {formatNumber(value)}
          </p>
        </div>
        <p className="text-end text-[13px] leading-relaxed text-amber-900 dark:text-amber-200">
          {isUr ? 'فی گرام' : 'Rate used'}: Rs {formatNumber(Math.round(perGram))}/g
          <br />
          {isUr ? 'بنوائی اور ٹیکس کے بغیر' : 'Before making charges & tax'}
        </p>
      </div>
    </section>
  )
}
