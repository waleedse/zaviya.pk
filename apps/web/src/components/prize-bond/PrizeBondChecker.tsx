'use client'

import { useState } from 'react'

interface Win {
  number: string
  date: string
  drawNo: number | null
  rank: number
  amount: number | null
}

const rankText = (r: number, ur: boolean) => (ur ? ['پہلا انعام', 'دوسرا انعام', 'تیسرا انعام'][r - 1] ?? `انعام ${r}` : ['First prize', 'Second prize', 'Third prize'][r - 1] ?? `Prize ${r}`)
const rs = (n: number | null) => (n ? `Rs ${n.toLocaleString('en-US')}` : '')
const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

/** Paste bond numbers (or a range), check every official list we read; share the checker on WhatsApp */
export function PrizeBondChecker({ denomination, pageUrl, ur }: { denomination: number; pageUrl: string; ur?: boolean }) {
  const [input, setInput] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<{ checked: number; draws: number; wins: Win[] } | null>(null)

  async function check(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim()) return
    setState('busy')
    try {
      const res = await fetch(`/api/prize-bond-check?d=${denomination}&n=${encodeURIComponent(input)}`)
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      setResult({ checked: json.checked, draws: json.draws.length, wins: json.wins })
      setState('done')
    } catch {
      setState('error')
    }
  }

  const shareText = encodeURIComponent(
    `${ur ? `Rs ${denomination} پرائز بانڈ چیک کریں، اپنا نمبر ڈالیں اور فوراً دیکھیں:` : `Check your Rs ${denomination} prize bond in seconds (official National Savings lists):`} ${pageUrl}?utm_source=whatsapp&utm_medium=share&utm_campaign=prizebond`,
  )

  return (
    <div className="rounded-2xl border-2 border-accent bg-bg p-5 shadow-sm">
      <form onSubmit={check} className="flex flex-col gap-3">
        <label htmlFor="bonds" className="font-display text-lg font-bold">
          {ur ? `اپنے Rs ${denomination} بانڈ نمبر لکھیں` : `Check your Rs ${denomination} prize bonds`}
        </label>
        <textarea
          id="bonds"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={3}
          inputMode="numeric"
          placeholder={ur ? 'مثلاً 024132, 355420 یا رینج 123400-123499' : 'e.g. 024132, 355420 or a range 123400-123499'}
          className="w-full rounded-xl border border-border bg-surface p-3 font-mono text-lg"
        />
        <button type="submit" disabled={state === 'busy'} className="rounded-xl bg-accent px-5 py-3 text-lg font-bold text-accent-fg disabled:opacity-60">
          {state === 'busy' ? (ur ? 'چیک ہو رہا ہے…' : 'Checking…') : ur ? 'چیک کریں' : 'Check now'}
        </button>
      </form>
      {state === 'error' && <p className="mt-3 text-red-600">{ur ? 'ابھی چیک نہیں ہو سکا، دوبارہ کوشش کریں۔' : 'Could not check right now. Please try again.'}</p>}
      {state === 'done' && result && (
        <div className="mt-4" aria-live="polite">
          {result.wins.length ? (
            <div className="rounded-xl bg-green-50 p-4 text-green-900 dark:bg-green-950 dark:text-green-100">
              <p className="text-xl font-bold">{ur ? 'مبارک ہو! آپ کا انعام نکلا ہے' : 'Congratulations, you have a winning bond!'}</p>
              <ul className="mt-2 space-y-1">
                {result.wins.map((w) => (
                  <li key={`${w.number}-${w.date}-${w.rank}`} className="font-mono">
                    {w.number}: {rankText(w.rank, !!ur)} {rs(w.amount)} · {day(w.date)}
                    {w.drawNo ? ` (draw ${w.drawNo})` : ''}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-sm">{ur ? 'انعام کے لیے بانڈ اور شناختی کارڈ کے ساتھ اسٹیٹ بینک یا نیشنل سیونگز سینٹر جائیں۔ سرکاری فہرست سے ضرور ملائیں۔' : 'Claim at an SBP BSC office or National Savings centre with the bond and your CNIC. Always confirm on the official list.'}</p>
            </div>
          ) : (
            <p className="rounded-xl bg-surface p-4">
              {ur
                ? `${result.checked} نمبر پچھلے ${result.draws} ڈرا میں چیک کیے: کوئی انعام نہیں نکلا۔`
                : `Checked ${result.checked} number${result.checked === 1 ? '' : 's'} against the last ${result.draws} draws: no prize this time.`}
            </p>
          )}
        </div>
      )}
      <a
        href={`https://wa.me/?text=${shareText}`}
        target="_blank"
        rel="noopener"
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-4 py-2 font-semibold text-white"
      >
        {ur ? 'واٹس ایپ پر شیئر کریں' : 'Share on WhatsApp'}
      </a>
    </div>
  )
}
