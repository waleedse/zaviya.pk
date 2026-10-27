'use client'

import { useState } from 'react'
import { ATL, atlIdKind, atlSmsText } from '@/lib/atl-check'

/** Builds the FBR SMS text in the browser. The number is never sent to Zaviya. */
export function AtlSmsHelper({ isUr }: { isUr: boolean }) {
  const [value, setValue] = useState('')
  const kind = atlIdKind(value)
  const text = atlSmsText(value)
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <label htmlFor="atl-id" className="font-semibold">
        {isUr ? 'شناختی کارڈ (13 ہندسے) یا این ٹی این (7 ہندسے)' : 'CNIC (13 digits) or NTN (7 digits)'}
      </label>
      <input
        id="atl-id"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(e) => setValue(e.target.value.slice(0, 20))}
        placeholder="3520212345671"
        dir="ltr"
        className="mt-2 w-full rounded-lg border border-border bg-bg px-3 py-2 text-lg"
      />
      <p className="mt-2 text-sm text-fg-muted">
        {isUr ? 'یہ نمبر آپ کے براؤزر سے باہر نہیں جاتا۔ ہم اسے محفوظ نہیں کرتے۔' : 'This number stays in your browser. Zaviya does not send or store it.'}
      </p>
      {text ? (
        <div className="mt-4 space-y-2" aria-live="polite">
          <p>
            {isUr ? `یہ پیغام ${ATL.smsShortcode} پر بھیجیں:` : `Send this SMS to ${ATL.smsShortcode}:`}{' '}
            <code dir="ltr" className="rounded bg-bg px-2 py-1 font-bold">
              {text}
            </code>
          </p>
          <a href={`sms:${ATL.smsShortcode}?body=${encodeURIComponent(text)}`} className="inline-block rounded-lg bg-accent px-4 py-2 font-semibold text-accent-fg">
            {isUr ? 'ایس ایم ایس ایپ کھولیں' : 'Open SMS app'}
          </a>{' '}
          <span className="text-sm text-fg-muted">{kind === 'ntn' ? (isUr ? 'کمپنی/AOP کے لیے این ٹی این' : 'NTN: for companies and AOPs') : ''}</span>
        </div>
      ) : value ? (
        <p className="mt-3 text-sm text-red-600" aria-live="polite">
          {isUr ? 'شناختی کارڈ کے 13 ہندسے یا این ٹی این کے 7 ہندسے درج کریں۔' : 'Enter 13 digits for a CNIC or 7 digits for an NTN.'}
        </p>
      ) : null}
    </div>
  )
}
