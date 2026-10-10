import { buildRss } from '../../rss.xml/route'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export async function GET() {
  return buildRss('ur')
}
