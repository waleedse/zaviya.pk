'use client'

import { usePathname } from 'next/navigation'

/** Shop pages (prices hub, categories, products, compare) show only the header: no trending strip or breaking ticker, so the first screen is the search */
const SHOP = /^(\/ur)?\/(prices|product|products|compare-products)(\/|$)/

export function HideOnShop({ children }: { children: React.ReactNode }) {
  const path = usePathname() ?? ''
  return SHOP.test(path) ? null : <>{children}</>
}
