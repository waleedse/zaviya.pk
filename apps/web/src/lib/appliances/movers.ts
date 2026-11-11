import { applianceIndexable, fullName, type ApplianceView } from './logic'
import { buildSeries, latestMove, type Move } from './series'

export interface Mover {
  item: ApplianceView
  name: string
  href: string
  move: Move
}

/**
 * The biggest recent price changes, up and down, from the recorded history. Window: 14 days; with fewer than `min`
 * of either kind it widens to 45 days. A change under 0.5% is noise. Appliances change by sale price, groceries
 * by PBS release, cars by maker list: all real recorded changes.
 */
export function topMovers(all: ApplianceView[], per = 5, now = Date.now()): { up: Mover[]; down: Mover[]; windowDays: number } {
  const moves = all
    .filter((a) => applianceIndexable(a) && a.priceHistory.length > 1)
    .map((item) => ({ item, series: buildSeries(item.priceHistory, item.pricePkr, item.priceUpdatedAt) }))
  const pick = (days: number) => {
    const list: Mover[] = []
    for (const { item, series } of moves) {
      const move = latestMove(series, days, now)
      if (!move || Math.abs(move.pct) < 0.5) continue
      list.push({ item, name: fullName(item), href: `/prices/${item.category.slug}/${item.slug}`, move })
    }
    return list
  }
  let windowDays = 14
  let list = pick(windowDays)
  if (list.filter((m) => m.move.pct > 0).length < 3 || list.filter((m) => m.move.pct < 0).length < 3) {
    windowDays = 45
    list = pick(windowDays)
  }
  // a mix of kinds: groceries are the most searched, so they come first when the size of the move ties
  const byMove = (a: Mover, b: Mover) => Math.abs(b.move.pct) - Math.abs(a.move.pct)
  return {
    up: list.filter((m) => m.move.pct > 0).sort(byMove).slice(0, per),
    down: list.filter((m) => m.move.pct < 0).sort(byMove).slice(0, per),
    windowDays,
  }
}
