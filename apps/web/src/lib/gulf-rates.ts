/** SAR and AED open-market rows from the dollar page's rate table (ZAV-208). The worker already stores them (forex.pk open market). */
export interface GulfRate {
  code: 'SAR' | 'AED'
  /** exchange-company buy price: what you get per unit when you sell your riyal/dirham */
  buy: number
  /** exchange-company sell price: what you pay per unit when you buy riyal/dirham */
  sell: number
  market?: number
}

export function pickGulfRates(table: { label: string; values: Record<string, number | string> }[]): GulfRate[] {
  const out: GulfRate[] = []
  for (const code of ['SAR', 'AED'] as const) {
    const row = table.find((r) => r.label.includes(`(${code})`))
    const buy = Number(row?.values.buy)
    const sell = Number(row?.values.sell)
    if (!row || !(buy > 0) || !(sell > 0)) continue
    const market = Number(row.values.market)
    out.push({ code, buy, sell, ...(market > 0 ? { market } : {}) })
  }
  return out
}
