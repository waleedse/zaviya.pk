import { NextResponse } from 'next/server'
import { RESULT_DENOMINATIONS, findWins, getDraws, parseBondInput, type ResultDenomination } from '@/lib/prize-bond-results'

/** GET /api/prize-bond-check?d=1500&n=024132,123400-123499 -> wins in the official lists of the last ~3 years */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const d = Number(url.searchParams.get('d'))
  if (!(RESULT_DENOMINATIONS as readonly number[]).includes(d)) return NextResponse.json({ ok: false, error: 'denomination' }, { status: 400 })
  const numbers = parseBondInput(url.searchParams.get('n') ?? '')
  if (!numbers.length) return NextResponse.json({ ok: false, error: 'numbers' }, { status: 400 })
  const draws = await getDraws(d as ResultDenomination)
  return NextResponse.json(
    {
      ok: true,
      checked: numbers.length,
      draws: draws.map((x) => ({ date: x.date, drawNo: x.drawNo })),
      wins: findWins(numbers, draws),
    },
    { headers: { 'cache-control': 'public, s-maxage=600' } },
  )
}
