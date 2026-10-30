'use client'

import { useState } from 'react'
import { amortisation, DEFAULT_AMOUNT, DEFAULT_SPREAD, DEFAULT_TENURE_YEARS, loanSummary, type LoanType } from '@/lib/loan-emi'

const fmt = (n: number) => Math.round(n).toLocaleString('en-PK')

/** All maths runs in the browser. No input is sent to Zaviya or anywhere else. */
export function LoanEmiCalculator({ isUr, policyRate, kibor }: { isUr: boolean; policyRate: number; kibor: { rate: number; asOf: string } | null }) {
  const [type, setType] = useState<LoanType>('car')
  const [base, setBase] = useState<'policy' | 'kibor'>('policy')
  const [amount, setAmount] = useState(DEFAULT_AMOUNT.car)
  const [years, setYears] = useState(DEFAULT_TENURE_YEARS.car)
  const [spread, setSpread] = useState(DEFAULT_SPREAD.car)
  const [showAll, setShowAll] = useState(false)

  const baseRate = base === 'kibor' && kibor ? kibor.rate : policyRate
  const rate = baseRate + spread
  const months = Math.max(1, Math.round(years * 12))
  const s = loanSummary(amount, rate, months)
  const rows = amortisation(amount, rate, months)
  const shown = showAll ? rows : rows.slice(0, 12)

  const pick = (t: LoanType) => {
    setType(t)
    setAmount(DEFAULT_AMOUNT[t])
    setYears(DEFAULT_TENURE_YEARS[t])
    setSpread(DEFAULT_SPREAD[t])
  }
  const labels: Record<LoanType, string> = isUr ? { car: 'کار', home: 'گھر', personal: 'پرسنل' } : { car: 'Car', home: 'Home', personal: 'Personal' }
  const field = 'mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-lg'

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div role="tablist" className="flex gap-2">
        {(['car', 'home', 'personal'] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={type === t} onClick={() => pick(t)} className={`rounded-lg border border-border px-4 py-2 font-semibold ${type === t ? 'bg-accent text-accent-fg' : 'bg-bg'}`}>
            {labels[t]}
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block font-semibold">
          {isUr ? 'قرض کی رقم (روپے)' : 'Loan amount (Rs)'}
          <input type="number" inputMode="numeric" min={0} value={amount} onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))} dir="ltr" className={field} />
        </label>
        <label className="block font-semibold">
          {isUr ? 'مدت (سال)' : 'Tenure (years)'}
          <input type="number" inputMode="decimal" min={0.5} max={30} step={0.5} value={years} onChange={(e) => setYears(Math.min(30, Math.max(0.5, Number(e.target.value) || 0.5)))} dir="ltr" className={field} />
        </label>
        <label className="block font-semibold">
          {isUr ? 'بنیادی شرح' : 'Base rate'}
          <select value={base} onChange={(e) => setBase(e.target.value as 'policy' | 'kibor')} className={field}>
            <option value="policy">{isUr ? `ایس بی پی پالیسی ریٹ (${policyRate}%)` : `SBP policy rate (${policyRate}%)`}</option>
            {kibor && <option value="kibor">{isUr ? `KIBOR (${kibor.rate}%، ${kibor.asOf})` : `KIBOR (${kibor.rate}%, as of ${kibor.asOf})`}</option>}
          </select>
        </label>
        <label className="block font-semibold">
          {isUr ? 'بینک کا اسپریڈ (فیصد پوائنٹ)' : 'Bank spread (percentage points)'}
          <input type="number" inputMode="decimal" min={0} max={30} step={0.25} value={spread} onChange={(e) => setSpread(Math.min(30, Math.max(0, Number(e.target.value) || 0)))} dir="ltr" className={field} />
        </label>
      </div>
      <p className="mt-2 text-sm text-fg-muted">
        {isUr ? 'یہ اعداد آپ کے براؤزر سے باہر نہیں جاتے۔' : 'Your numbers stay in your browser. Nothing is sent to Zaviya.'}
      </p>

      <div className="mt-4 rounded-xl bg-bg p-4" aria-live="polite">
        <p className="text-sm font-semibold uppercase tracking-wide text-fg-muted">{isUr ? `ماہانہ قسط (شرح ${rate.toFixed(2)}%)` : `Monthly EMI at ${rate.toFixed(2)}%`}</p>
        <p className="mt-1 font-display text-4xl font-extrabold" dir="ltr">Rs {fmt(s.monthly)}</p>
        <p className="mt-2 text-fg-muted" dir="ltr">
          {isUr ? 'کل سود' : 'Total interest'}: Rs {fmt(s.interest)} · {isUr ? 'کل ادائیگی' : 'Total repayment'}: Rs {fmt(s.total)}
        </p>
      </div>

      <h3 className="mt-6 font-display text-lg font-bold">{isUr ? 'قسطوں کا جدول' : 'Amortisation table'}</h3>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-[0.95rem]" dir="ltr">
          <thead>
            <tr className="border-b border-border text-fg-muted">
              <th className="py-2 pr-4">{isUr ? 'ماہ' : 'Month'}</th>
              <th className="py-2 pr-4">{isUr ? 'اصل' : 'Principal'}</th>
              <th className="py-2 pr-4">{isUr ? 'سود' : 'Interest'}</th>
              <th className="py-2">{isUr ? 'بقایا' : 'Balance'}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.month} className="border-b border-border">
                <td className="py-2 pr-4">{r.month}</td>
                <td className="py-2 pr-4">{fmt(r.principal)}</td>
                <td className="py-2 pr-4">{fmt(r.interest)}</td>
                <td className="py-2">{fmt(r.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 12 && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-3 rounded-lg border border-border px-4 py-2 font-semibold">
          {showAll ? (isUr ? 'پہلے 12 ماہ دکھائیں' : 'Show first 12 months') : isUr ? `تمام ${rows.length} ماہ دکھائیں` : `Show all ${rows.length} months`}
        </button>
      )}
    </div>
  )
}
