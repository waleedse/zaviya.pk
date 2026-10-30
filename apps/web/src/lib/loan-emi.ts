/**
 * Loan EMI calculator maths (ZAV-239). Pure functions, run in the browser only: loan inputs are never sent anywhere.
 * KIBOR is an editable constant: set it when a fix is copied from https://www.sbp.org.pk/ecodata/kibor_index.asp.
 * Until then it stays null and the calculator uses the SBP policy rate (lib/policy-rate.ts) plus an editable spread.
 */
export type LoanType = 'car' | 'home' | 'personal'

/** Hand-edited reference KIBOR (6M offer, percent). null = not supplied yet. */
export const KIBOR_REFERENCE: { rate: number; asOf: string } | null = null

/** Typical starting spreads over the base rate, percentage points. The user edits them; they are not bank quotes. */
export const DEFAULT_SPREAD: Record<LoanType, number> = { car: 3, home: 3, personal: 6 }
export const DEFAULT_TENURE_YEARS: Record<LoanType, number> = { car: 5, home: 20, personal: 3 }
export const DEFAULT_AMOUNT: Record<LoanType, number> = { car: 3_000_000, home: 15_000_000, personal: 500_000 }

/** Monthly instalment for a reducing-balance loan. annualRatePct is percent (e.g. 15). */
export function emi(principal: number, annualRatePct: number, months: number): number {
  if (!(principal > 0) || !(months > 0)) return 0
  const r = annualRatePct / 100 / 12
  if (r <= 0) return principal / months
  const f = Math.pow(1 + r, months)
  return (principal * r * f) / (f - 1)
}

export interface AmortRow {
  month: number
  interest: number
  principal: number
  balance: number
}

export function amortisation(principal: number, annualRatePct: number, months: number): AmortRow[] {
  const pay = emi(principal, annualRatePct, months)
  const r = annualRatePct / 100 / 12
  const rows: AmortRow[] = []
  let balance = principal
  for (let m = 1; m <= months && pay > 0; m++) {
    const interest = balance * r
    const princ = m === months ? balance : pay - interest
    balance = m === months ? 0 : balance - princ
    rows.push({ month: m, interest, principal: princ, balance: Math.max(0, balance) })
  }
  return rows
}

export function loanSummary(principal: number, annualRatePct: number, months: number) {
  const monthly = emi(principal, annualRatePct, months)
  const total = monthly * months
  return { monthly, total, interest: total - principal }
}
