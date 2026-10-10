import type { Locale } from '@zaviya/shared'
import { formatNumber } from '@/lib/format'

export function RateTable({
  rows,
  locale,
}: {
  locale: Locale
  rows: { label: string; values: Record<string, number | string> }[]
}) {
  const safeRows = Array.isArray(rows) ? rows : []
  const cols = safeRows.length ? Object.keys(safeRows[0]!.values) : []
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-border">
      <table className="w-full min-w-[320px] text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-2/80 text-start text-fg-muted">
            <th className="px-4 py-3 font-medium" scope="col" />
            {cols.map((c) => (
              <th key={c} className="px-4 py-3 font-medium capitalize" scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {safeRows.map((row) => (
            <tr key={row.label} className="border-b border-border last:border-0">
              <th className="px-4 py-3 text-start font-semibold" scope="row">
                {row.label}
              </th>
              {cols.map((c) => (
                <td key={c} className="px-4 py-3" dir="ltr">
                  {typeof row.values[c] === 'number' ? formatNumber(row.values[c] as number, locale) : row.values[c]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
