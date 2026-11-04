import type { PhonePta, PhoneSpecs } from '@zaviya/shared'

export interface PhoneVariantView {
  ramGb: number | null
  storageGb: number
  label: string
  /** null = price not announced */
  pricePkr: number | null
  sourceUrl?: string
  checkedAt?: string
}

export interface PriceHistoryRow {
  date: string
  variant: string
  pricePkr: number
  sourceUrl?: string
}

/** A phone as the pages use it (plain data: no Payload types leak into components) */
export interface PhoneView {
  id: string | number
  slug: string
  name: string
  brand: { slug: string; name: string }
  launchDate?: string
  status: 'current' | 'discontinued' | 'upcoming'
  imageUrl?: string
  officialUrl?: string
  summary?: string
  colours: string[]
  variants: PhoneVariantView[]
  /** Lowest variant price; null = price not announced */
  pricePkr: number | null
  priceUpdatedAt?: string
  priceHistory: PriceHistoryRow[]
  pta?: Partial<PhonePta>
  specs: PhoneSpecs
  specsSourceUrl?: string
  popularity: number
  updatedAt?: string
}

export interface BrandView {
  id: string | number
  slug: string
  name: string
  officialSite?: string
  description?: string
  order: number
}

export interface PhonePair {
  /** URL part: /compare/<key> */
  key: string
  a: string
  b: string
}
