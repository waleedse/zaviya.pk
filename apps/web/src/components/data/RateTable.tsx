import type { Locale } from '@zaviya/shared'
import { formatNumber } from '@/lib/format'

// Also the display order (Postgres JSON doesn't keep key order).
const COL_LABELS: Record<string, [string, string]> = {
  tola: ['Per tola', 'فی تولہ'],
  '10g': ['Per 10 grams', 'فی 10 گرام'],
  gram: ['Per gram', 'فی گرام'],
  market: ['Market rate', 'مارکیٹ ریٹ'],
  buy: ['Open market buy', 'اوپن مارکیٹ خرید'],
  sell: ['Open market sell', 'اوپن مارکیٹ فروخت'],
  price: ['Price per litre', 'فی لیٹر قیمت'],
  change: ['Change', 'تبدیلی'],
}

export function RateTable({
  rows,
  locale,
}: {
  locale: Locale
  rows: { label: string; values: Record<string, number | string> }[]
}) {
  const safeRows = Array.isArray(rows) ? rows : []
  if (!safeRows.length) return null
  // Union of columns: not every row has every value (e.g. currencies without an open-market quote).
  const order = Object.keys(COL_LABELS)
  const cols = [...new Set(safeRows.flatMap((r) => Object.keys(r.values)))].sort((a, b) => order.indexOf(a) - order.indexOf(b))
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-border bg-surface">
      <table className="w-full min-w-[420px] text-[0.95rem]">
        <thead>
          <tr className="border-b border-border bg-surface-2 text-fg-muted">
            <th className="px-4 py-3 text-start text-xs font-bold uppercase tracking-wider rtl:normal-case" scope="col" />
            {cols.map((c) => (
              <th key={c} className="px-4 py-3 text-end text-xs font-bold uppercase tracking-wider rtl:normal-case" scope="col">
                {COL_LABELS[c]?.[locale === 'ur' ? 1 : 0] ?? c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {safeRows.map((row) => (
            <tr key={row.label} className="border-b border-border last:border-0 hover:bg-surface-2/50">
              <th className="px-4 py-3.5 text-start font-semibold" scope="row">
                {row.label}
              </th>
              {cols.map((c) => (
                <td key={c} className="px-4 py-3.5 text-end font-medium tabular-nums" dir="ltr">
                  {row.values[c] === undefined ? '—' : typeof row.values[c] === 'number' ? formatNumber(row.values[c] as number, locale) : row.values[c]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
