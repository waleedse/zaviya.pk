'use client'

import { useState } from 'react'
import { findFee, rs } from '@/lib/passport-fees'

export function PassportFeePicker({ isUr }: { isUr: boolean }) {
  const [years, setYears] = useState(5)
  const [pages, setPages] = useState(36)
  const fee = findFee(years, pages)
  const sel = 'rounded-lg border border-border bg-bg px-3 py-2'
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          {isUr ? 'مدت' : 'Validity'}
          <select className={sel} value={years} onChange={(e) => setYears(Number(e.target.value))}>
            <option value={5}>{isUr ? '5 سال' : '5 years'}</option>
            <option value={10}>{isUr ? '10 سال' : '10 years'}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          {isUr ? 'صفحات' : 'Pages'}
          <select className={sel} value={pages} onChange={(e) => setPages(Number(e.target.value))}>
            <option value={36}>36</option>
            <option value={72}>72</option>
          </select>
        </label>
      </div>
      {fee ? (
        <dl className="mt-4 grid grid-cols-2 gap-3" aria-live="polite">
          <div>
            <dt className="text-sm text-fg-muted">{isUr ? 'عام فیس' : 'Normal fee'}</dt>
            <dd className="font-display text-3xl font-extrabold">{rs(fee.normal)}</dd>
          </div>
          <div>
            <dt className="text-sm text-fg-muted">{isUr ? 'ارجنٹ فیس' : 'Urgent fee'}</dt>
            <dd className="font-display text-3xl font-extrabold">{rs(fee.urgent)}</dd>
          </div>
        </dl>
      ) : null}
    </div>
  )
}
