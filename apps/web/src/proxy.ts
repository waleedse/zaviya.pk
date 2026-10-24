import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

const LOCALE_PREFIX = '/ur'

/** /<locale>/<category>?page=n → /<locale>/<category>/page/n, so category pages can be cached (no searchParams). */
function paginate(url: URL): void {
  const n = parseInt(url.searchParams.get('page') ?? '', 10)
  if (!(n > 1)) return
  if (/^\/(en|ur)\/[a-z0-9-]+$/.test(url.pathname)) {
    url.pathname = `${url.pathname}/page/${n}`
    url.searchParams.delete('page')
  }
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/ur')) {
    const url = request.nextUrl.clone()
    paginate(url)
    return url.pathname === pathname ? NextResponse.next() : NextResponse.rewrite(url)
  }

  const url = request.nextUrl.clone()
  url.pathname = `/en${pathname === '/' ? '' : pathname}`
  paginate(url)
  return NextResponse.rewrite(url)
}

export const config = {
  matcher: [
    '/((?!api|admin|embed|_next|sitemap\\.xml|news-sitemap\\.xml|robots\\.txt|rss\\.xml|ur/rss\\.xml|favicon|.*\\..*).*)',
  ],
}
