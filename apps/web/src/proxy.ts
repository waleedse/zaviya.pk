import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

const LOCALE_PREFIX = '/ur'

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/ur')) {
    return NextResponse.next()
  }

  const url = request.nextUrl.clone()
  url.pathname = `/en${pathname === '/' ? '' : pathname}`
  return NextResponse.rewrite(url)
}

export const config = {
  matcher: [
    '/((?!api|admin|_next|sitemap\\.xml|news-sitemap\\.xml|robots\\.txt|rss\\.xml|ur/rss\\.xml|favicon|.*\\..*).*)',
  ],
}
