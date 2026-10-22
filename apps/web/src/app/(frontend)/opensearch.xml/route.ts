import { openSearchXml } from '@/lib/seo'

export const dynamic = 'force-static'

export function GET() {
  return new Response(openSearchXml(), {
    headers: {
      'Content-Type': 'application/opensearchdescription+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
