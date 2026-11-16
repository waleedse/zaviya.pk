/**
 * Punjab motor vehicle (token) tax 2026-27. Edit this file only; the page and the sitemap read it.
 * Copied by hand on 16 Nov 2026 from the Punjab Excise & Taxation page https://excise.punjab.gov.pk/motorvehicle_tax
 * (table "Rates of Token tax, Income Tax, Professional Tax for Motor Car"; the 0.3% cell spans 1001-2000cc and
 * the 0.4% cell spans 2001cc and above, checked from the table's rowspans). Official source only.
 * Search demand (Google autocomplete, PK): "token tax 2026-27", "token tax 2026 punjab", "vehicle token tax 2026",
 * "token tax punjab 2026 27".
 */
export interface TokenRow {
  en: string
  ur: string
  /** 2026-27 token tax: a rupee amount, or a share of the invoice price */
  token: { rs: number; lifetime?: boolean } | { pctOfInvoice: number }
  prevYear: string
  incomeFiler: number | null
  incomeNonFiler: number | null
  professional: number
}

export const CAR_ROWS: TokenRow[] = [
  { en: 'Motorcycle (at registration)', ur: 'موٹر سائیکل (رجسٹریشن پر)', token: { rs: 1500, lifetime: true }, prevYear: 'Rs1,500', incomeFiler: null, incomeNonFiler: null, professional: 200 },
  { en: 'Car up to 1000cc', ur: '1000 سی سی تک کار', token: { rs: 20000, lifetime: true }, prevYear: 'Rs20,000', incomeFiler: 10000, incomeNonFiler: 30000, professional: 200 },
  { en: '1001 to 1199cc', ur: '1001 سے 1199 سی سی', token: { pctOfInvoice: 0.3 }, prevYear: '0.2%', incomeFiler: 1500, incomeNonFiler: 4500, professional: 200 },
  { en: '1200 to 1299cc', ur: '1200 سے 1299 سی سی', token: { pctOfInvoice: 0.3 }, prevYear: '0.2%', incomeFiler: 1750, incomeNonFiler: 5250, professional: 200 },
  { en: '1300cc', ur: '1300 سی سی', token: { pctOfInvoice: 0.3 }, prevYear: '0.2%', incomeFiler: 2500, incomeNonFiler: 7500, professional: 200 },
  { en: '1301 to 1499cc', ur: '1301 سے 1499 سی سی', token: { pctOfInvoice: 0.3 }, prevYear: '0.2%', incomeFiler: 2500, incomeNonFiler: 7500, professional: 200 },
  { en: '1500cc', ur: '1500 سی سی', token: { pctOfInvoice: 0.3 }, prevYear: '0.2%', incomeFiler: 3750, incomeNonFiler: 11250, professional: 200 },
  { en: '1501 to 1599cc', ur: '1501 سے 1599 سی سی', token: { pctOfInvoice: 0.3 }, prevYear: '0.2%', incomeFiler: 3750, incomeNonFiler: 11250, professional: 200 },
  { en: '1600 to 1999cc', ur: '1600 سے 1999 سی سی', token: { pctOfInvoice: 0.3 }, prevYear: '0.2%', incomeFiler: 4500, incomeNonFiler: 13500, professional: 200 },
  { en: '2000cc', ur: '2000 سی سی', token: { pctOfInvoice: 0.3 }, prevYear: '0.2%', incomeFiler: 10000, incomeNonFiler: 30000, professional: 200 },
  { en: '2001 to 2500cc', ur: '2001 سے 2500 سی سی', token: { pctOfInvoice: 0.4 }, prevYear: '0.3%', incomeFiler: 10000, incomeNonFiler: 30000, professional: 200 },
  { en: 'Above 2500cc', ur: '2500 سی سی سے زیادہ', token: { pctOfInvoice: 0.4 }, prevYear: '0.3%', incomeFiler: 10000, incomeNonFiler: 30000, professional: 200 },
]

export const BIKE_REGISTRATION = [
  { en: 'Up to 70cc', ur: '70 سی سی تک', rs: 1000 },
  { en: '71 to 100cc', ur: '71 سے 100 سی سی', rs: 1500 },
  { en: '101 to 125cc', ur: '101 سے 125 سی سی', rs: 2000 },
  { en: '126 to 150cc', ur: '126 سے 150 سی سی', rs: 2500 },
]

export const TRANSFER_FEE = [
  { en: 'Motorcycle / scooter', ur: 'موٹر سائیکل / اسکوٹر', rs: 910 },
  { en: 'Car up to 1000cc', ur: '1000 سی سی تک کار', rs: 4540 },
  { en: 'Car 1001 to 1800cc', ur: '1001 سے 1800 سی سی کار', rs: 9075 },
  { en: 'Car above 1800cc', ur: '1800 سی سی سے زیادہ کار', rs: 18150 },
]

export const TOKEN = {
  year: '2026-27',
  readOn: '2026-11-16',
  url: 'https://excise.punjab.gov.pk/motorvehicle_tax',
  calculator: 'https://epay.punjab.gov.pk/',
  rebatePct: 10,
  rebateBy: '31 August',
}

export const rs = (n: number) => `Rs${Math.round(n).toLocaleString('en-US')}`

/** 2026-27 token tax for one car, from its invoice price where the rate is a percentage. */
export function tokenTax(row: TokenRow, invoicePrice: number): number {
  return 'rs' in row.token ? row.token.rs : (invoicePrice * row.token.pctOfInvoice) / 100
}
