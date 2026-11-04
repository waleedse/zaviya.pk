/** Date-only fields (YYYY-MM-DD, Pakistan calendar day) editors type into Payload. */
export function isDayString(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

/** Payload field validator: empty is fine, otherwise a real YYYY-MM-DD date. */
export const validateDay = (v: unknown): true | string => (v === undefined || v === null || v === '' || isDayString(v) ? true : 'Use the format YYYY-MM-DD, e.g. 2026-11-25')
