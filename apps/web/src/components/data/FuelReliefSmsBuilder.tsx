'use client'

import { useState } from 'react'
import { PROVINCES, RELIEF, regSmsText } from '@/lib/fuel-relief'

/** Builds the REG text in the browser. Nothing typed here is sent to Zaviya. */
export function FuelReliefSmsBuilder({ isUr }: { isUr: boolean }) {
  const [cnic, setCnic] = useState('')
  const [plate, setPlate] = useState('')
  const [province, setProvince] = useState('')
  const [date, setDate] = useState('')
  const text = regSmsText(cnic, plate, province, date)
  const field = 'mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2'
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          {isUr ? 'شناختی کارڈ (13 ہندسے)' : 'CNIC (13 digits)'}
          <input inputMode="numeric" autoComplete="off" dir="ltr" className={field} value={cnic} onChange={(e) => setCnic(e.target.value.slice(0, 17))} placeholder="3520212345671" />
        </label>
        <label className="text-sm font-semibold">
          {isUr ? 'گاڑی کا نمبر' : 'Vehicle number'}
          <input autoComplete="off" dir="ltr" className={field} value={plate} onChange={(e) => setPlate(e.target.value.slice(0, 15))} placeholder="LEA-1234" />
        </label>
        <label className="text-sm font-semibold">
          {isUr ? 'صوبہ جہاں گاڑی رجسٹر ہے' : 'Province where the vehicle is registered'}
          <select className={field} value={province} onChange={(e) => setProvince(e.target.value)}>
            <option value="">{isUr ? 'منتخب کریں' : 'Choose'}</option>
            {PROVINCES.map((p) => (
              <option key={p.code} value={p.code}>
                {isUr ? p.ur : p.en} ({p.code})
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold">
          {isUr ? 'گاڑی کی رجسٹریشن کی تاریخ' : 'Vehicle registration date'}
          <input type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      <p className="mt-3 text-sm text-fg-muted">
        {isUr ? 'یہ معلومات آپ کے براؤزر سے باہر نہیں جاتیں۔ ہم انہیں بھیجتے یا محفوظ نہیں کرتے۔' : 'Nothing you type here leaves your browser. Zaviya does not send or store it.'}
      </p>
      {text ? (
        <div className="mt-4 space-y-2" aria-live="polite">
          <p>
            {isUr ? `یہ پیغام ${RELIEF.shortcode} پر اپنی ہی نام کی SIM سے بھیجیں:` : `Send this from a SIM registered in your own name to ${RELIEF.shortcode}:`}{' '}
            <code dir="ltr" className="rounded bg-bg px-2 py-1 font-bold">
              {text}
            </code>
          </p>
          <a href={`sms:${RELIEF.shortcode}?body=${encodeURIComponent(text)}`} className="inline-block rounded-lg bg-accent px-4 py-2 font-semibold text-accent-fg">
            {isUr ? 'ایس ایم ایس ایپ کھولیں' : 'Open SMS app'}
          </a>
        </div>
      ) : null}
    </div>
  )
}
