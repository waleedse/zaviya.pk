import { fullName, type ApplianceView } from './logic'

/**
 * The words Pakistanis type (Google autocomplete, gl=pk, 11 Nov 2026), per item slug. The data keeps the official name
 * ("Eggs (Farm) per Dozen", "CD 70"); only titles and H1s use the search name, and the official name stays in the page.
 * `qualifier` is the part people add ("20 kg"); `model` is the official model kept in brackets for bikes.
 */
export interface SearchName {
  search: string
  qualifier?: string
  model?: string
}

export const SEARCH_NAMES: Record<string, SearchName> = {
  // groceries (PBS)
  'atta-20kg-price': { search: 'Atta Price', qualifier: '20 kg' },
  'live-chicken-price': { search: 'Chicken Rate' },
  'eggs-price': { search: 'Egg Rate' },
  'sugar-price': { search: 'Sugar Price' },
  'ghee-1kg-price': { search: 'Ghee Price', qualifier: '1 kg' },
  'ghee-2-5kg-price': { search: 'Ghee Price', qualifier: '2.5 kg' },
  'fresh-milk-price': { search: 'Milk Price', qualifier: 'per litre' },
  'tomato-price': { search: 'Tomato Price' },
  'onion-price': { search: 'Onion Price' },
  'potato-price': { search: 'Potato Price' },
  'lpg-cylinder-price': { search: 'LPG Cylinder Price', qualifier: '11.67 kg' },
  'cooking-oil-5-litre-price': { search: 'Cooking Oil Price', qualifier: '5 litre' },
  'basmati-rice-price': { search: 'Basmati Rice Price' },
  'beef-price': { search: 'Beef Price' },
  'mutton-price': { search: 'Mutton Price' },
  // bikes
  'honda-cd-70': { search: 'Honda 70', model: 'CD 70' },
  'honda-cg-125': { search: 'Honda 125', model: 'CG 125' },
}

export const TITLE_MAX = 65
const HINT_CITIES = ['Lahore', 'Karachi', 'Rawalpindi', 'Islamabad']

/** People searching in autumn already type next year's model ("honda 70 price in pakistan 2027") */
export function modelYear(d = new Date()): number {
  const y = Number(d.toLocaleDateString('en-GB', { year: 'numeric', timeZone: 'Asia/Karachi' }))
  const m = Number(d.toLocaleDateString('en-GB', { month: 'numeric', timeZone: 'Asia/Karachi' }))
  return m >= 10 ? y + 1 : y
}

/** "Egg Rate" for the egg item, the official name where we have no alias */
export const searchName = (a: Pick<ApplianceView, 'slug' | 'name'>): string => SEARCH_NAMES[a.slug]?.search ?? a.name

/** H1 in the searcher's words; the official name stays in the summary under it */
export function itemH1(a: ApplianceView, year = modelYear()): string {
  const s = SEARCH_NAMES[a.slug]
  if (a.brand.kind === 'source') return s ? `${s.search} today in Pakistan${s.qualifier ? ` (${s.qualifier})` : ''}` : `${a.name} price today in Pakistan`
  if (s?.model) return `${s.search} price in Pakistan ${year} model (${s.model})`
  return `${fullName(a)} price in Pakistan`
}

/** <title> for an item page, at most TITLE_MAX characters when the aliased pieces allow it */
export function itemTitle(a: ApplianceView, when: string, year = modelYear()): string {
  const s = SEARCH_NAMES[a.slug]
  if (a.brand.kind !== 'source') {
    return s?.model ? `${s.search} Price in Pakistan ${year} Model (${s.model}) Today` : `${fullName(a)} Price in Pakistan ${when}`
  }
  const t = s ? `${s.search} Today in Pakistan (${[s.qualifier, when].filter(Boolean).join(', ')})` : `${a.name} Price Today in Pakistan (${when})`
  const cities: string[] = []
  for (const c of HINT_CITIES) {
    if (`${t}: ${[...cities, c].join(', ')}`.length > TITLE_MAX) break
    cities.push(c)
  }
  return cities.length ? `${t}: ${cities.join(', ')}` : t
}
