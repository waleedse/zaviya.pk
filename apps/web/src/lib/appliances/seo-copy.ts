import { formatPkr } from '@zaviya/shared'
import { applianceIndexable, fullName, sortByPrice, type ApplianceView, type CategoryDef } from './logic'

/**
 * Titles and intros for /prices/<category>, written for the searches in the category's `keywords`
 * ("atta price today", "bike price in Pakistan", "AC price in Pakistan") and the month, which people add to price searches.
 * Built only from the data we list, so every number on the page is true.
 */
export function categoryCopy(cat: CategoryDef, items: ApplianceView[], when: string) {
  const priced = sortByPrice(items.filter(applianceIndexable))
  const top = [...priced].sort((a, b) => b.hotScore - a.hotScore || b.popularity - a.popularity).slice(0, 3)
  const named = top.map((a) => `${fullName(a)} ${formatPkr(a.pricePkr!)}`).join(', ')
  const brands = [...new Set(items.filter((a) => a.brand.kind !== 'source').map((a) => a.brand.name))]
  const kw = cat.keywords[0]

  if (cat.group === 'groceries') {
    return {
      metaTitle: `${cat.name} Prices Today in Pakistan (${when}): Lahore, Karachi, Islamabad`,
      metaDescription: `${kw} and more: ${named || cat.name.toLowerCase()} on average this week, with the price in 17 cities from the Pakistan Bureau of Statistics weekly survey.`.slice(0, 300),
      h1: `${cat.name} prices today in Pakistan`,
      intro: `This week's official prices of ${items.length} items (${cat.ur}) in 17 cities, from the Pakistan Bureau of Statistics. Open an item to see the price in Lahore, Karachi, Islamabad and every other city surveyed.`,
    }
  }
  if (cat.group === 'vehicles') {
    const what = cat.slug === 'cars' ? 'ex-factory prices from the makers\' own price lists' : 'retail prices from the maker\'s own store'
    return {
      metaTitle: `${cat.name} Prices in Pakistan ${when}: ${top.map((a) => a.name).slice(0, 3).join(', ') || 'Latest Price List'}`,
      metaDescription: `${kw}: ${named || 'latest official prices'}. ${items.length} ${cat.name.toLowerCase()} with ${what}${brands.length ? ` (${brands.join(', ')})` : ''}, checked every day, with price history.`.slice(0, 300),
      h1: `${cat.name} prices in Pakistan (${when})`,
      intro: `Official ${what} for ${items.length} ${cat.name.toLowerCase()}${brands.length ? ` from ${brands.join(', ')}` : ''}, cheapest first and checked every day.${cat.slug === 'cars' ? ' Registration, taxes and freight are extra.' : ''}`,
    }
  }
  return {
    metaTitle: `${cat.name} Prices in Pakistan ${when}: Latest ${cat.singular} Price List`,
    metaDescription: `${kw}: ${items.length} ${cat.name.toLowerCase()} with official PKR prices${brands.length ? ` from ${brands.join(', ')}` : ''}${named ? `, such as ${named}` : ''}. Price list, specs, price history and a link to buy from the brand's store.`.slice(0, 300),
    h1: `${cat.name} prices in Pakistan (${when})`,
    intro: `Official prices of ${items.length} ${cat.name.toLowerCase()} from the brands' own Pakistan stores, cheapest first, checked every day.`,
  }
}
