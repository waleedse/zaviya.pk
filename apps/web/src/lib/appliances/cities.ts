import type { CityPrice } from '@zaviya/shared'
import { searchName } from './searchNames'
import type { ApplianceView } from './logic'

/**
 * Items that get a page per city (/prices/<category>/<item>/<city>): the groceries people search by city.
 * Prices come only from the PBS weekly survey (17 cities). Gold and the dollar get no city pages: no real per-city source.
 */
export const CITY_PAGE_ITEMS = [
  'eggs-price',
  'atta-20kg-price',
  'live-chicken-price',
  'sugar-price',
  'ghee-1kg-price',
  'fresh-milk-price',
  'tomato-price',
  'onion-price',
  'lpg-cylinder-price',
] as const

export const citySlug = (city: string): string =>
  city
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

export const cityHref = (a: Pick<ApplianceView, 'slug' | 'category'>, city: string) => `/prices/${a.category.slug}/${a.slug}/${citySlug(city)}`

export const hasCityPages = (a: ApplianceView): boolean =>
  a.brand.kind === 'source' && (CITY_PAGE_ITEMS as readonly string[]).includes(a.slug) && a.pricePkr != null && a.cityPrices.length >= 3

/** City rows with a price, cheapest average first */
export const pricedCities = (a: ApplianceView): CityPrice[] => a.cityPrices.filter((c) => c.avg > 0).sort((x, y) => x.avg - y.avg || x.city.localeCompare(y.city))

export const findCity = (a: ApplianceView, slug: string): CityPrice | undefined => pricedCities(a).find((c) => citySlug(c.city) === slug)

export interface CityView {
  row: CityPrice
  national: number
  cheapest: CityPrice
  costliest: CityPrice
  isCheapest: boolean
  isCostliest: boolean
  /** other cities, cheapest first */
  others: CityPrice[]
  /** this city's average against the national average, in percent (rounded) */
  vsNationalPct: number
}

export function cityView(a: ApplianceView, slug: string): CityView | null {
  if (!hasCityPages(a)) return null
  const row = findCity(a, slug)
  if (!row) return null
  const all = pricedCities(a)
  const cheapest = all[0]!
  const costliest = all[all.length - 1]!
  const national = a.pricePkr!
  return {
    row,
    national,
    cheapest,
    costliest,
    isCheapest: cheapest.city === row.city,
    isCostliest: costliest.city === row.city,
    others: all.filter((c) => c.city !== row.city),
    vsNationalPct: Math.round((row.avg / national - 1) * 100),
  }
}

/** "Egg Rate Today in Lahore (November 2026)" */
export const cityTitle = (a: ApplianceView, city: string, when: string): string => `${searchName(a)} Today in ${city} (${when})`

/** Every (item, city) pair that has a page: the sitemap and static params */
export function cityPages(all: ApplianceView[]): { item: ApplianceView; city: string }[] {
  return all.filter(hasCityPages).flatMap((item) => pricedCities(item).map((c) => ({ item, city: c.city })))
}
