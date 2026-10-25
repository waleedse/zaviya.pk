import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(__filename)

const nextConfig: NextConfig = {
  transpilePackages: ['@zaviya/shared'],
  // Pre-rendering reads the live DB; on a loaded server a page can take over the 60 s default (the 22 Oct deploys failed on it)
  staticPageGenerationTimeout: 240,
  images: {
    remotePatterns: [
      // Cloudflare R2 public bucket for media in production
      ...(process.env.R2_PUBLIC_URL ? [{ protocol: 'https' as const, hostname: new URL(process.env.R2_PUBLIC_URL).hostname }] : []),
    ],
    localPatterns: [
      {
        pathname: '/api/media/file/**',
      },
    ],
  },
  async rewrites() {
    // IndexNow key file (ZAV-146): /<key>.txt is answered by /api/indexnow/<key>, which checks it against INDEXNOW_KEY
    return [{ source: '/:key([A-Za-z0-9-]{8,128}).txt', destination: '/api/indexnow/:key' }]
  },
  async headers() {
    // ZAV-215: Cloudflare was stamping its 4 h default max-age on the sitemaps, so Google could read a news sitemap hours old.
    // Browsers/Google always revalidate; the edge may hold them a few minutes.
    const cc = 'public, max-age=0, s-maxage=300, stale-while-revalidate=300'
    return [
      { source: '/sitemap.xml', headers: [{ key: 'Cache-Control', value: cc }] },
      { source: '/news-sitemap.xml', headers: [{ key: 'Cache-Control', value: cc }] },
    ]
  },
  async redirects() {
    return [
      { source: '/sbp-policy-rate-pakistan', destination: '/sbp-policy-rate', permanent: true },
      { source: '/zaviya-news', destination: '/about', permanent: true },
      { source: '/ur/zaviya-news', destination: '/ur/about', permanent: true },
    ]
  },
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    return webpackConfig
  },
  turbopack: {
    root: path.resolve(dirname, '../..'),
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
