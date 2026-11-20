import { ProductSearch } from '@/components/products/ProductSearch'
import { parseLocale } from '@/lib/locale'
import { buildPageMetadata } from '@/lib/seo'

/** /products: Zaviya's own product search across Pakistani store websites (docs/PRODUCT-SEARCH.md) */
export const revalidate = 300

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  return buildPageMetadata({
    locale,
    title: 'Search products and compare prices in Pakistan | Zaviya',
    description: 'Find any product sold online in Pakistan, see every store that sells it, each price and the best price.',
    enPath: '/products',
    absoluteTitle: true,
  })
}

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = '' } = await searchParams
  return <ProductSearch initialQuery={q.slice(0, 100)} />
}
