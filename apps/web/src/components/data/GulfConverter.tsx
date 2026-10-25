'use client'

import { useState } from 'react'
import type { GulfRate } from '@/lib/gulf-rates'

/** Amount in riyal/dirham to rupees at the open-market buy rate (what an exchange company pays you). */
export function GulfConverter({ rates, isUr }: { rates: GulfRate[]; isUr: boolean }) {
  const [code, setCode] = useState<GulfRate['code']>(rates[0]?.code ?? 'SAR')
  const [amount, setAmount] = useState('1000')
  const rate = rates.find((r) => r.code === code) ?? rates[0]
  const n = Number(amount.replace(/,/g, ''))
  if (!rate) return null
  const pkr = n > 0 ? Math.round(n * rate.buy) : 0
  return (
    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
      <input
        inputMode="decimal"
        aria-label={isUr ? 'رقم' : 'Amount'}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="h-11 w-36 rounded-xl border border-border bg-bg px-3 text-base"
      />
      <select aria-label={isUr ? 'کرنسی' : 'Currency'} value={code} onChange={(e) => setCode(e.target.value as GulfRate['code'])} className="h-11 rounded-xl border border-border bg-bg px-3 text-base">
        {rates.map((r) => (
          <option key={r.code} value={r.code}>
            {r.code}
          </option>
        ))}
      </select>
      <p className="text-lg font-bold">
        {isUr ? '≈ ' : '≈ '}Rs{pkr.toLocaleString('en-US')} <span className="text-sm font-normal text-fg-muted">({isUr ? 'خرید ریٹ' : 'at the buy rate'} {rate.buy})</span>
      </p>
    </div>
  )
}
