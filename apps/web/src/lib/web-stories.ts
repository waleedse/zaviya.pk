import type { ArticleCard, ArticleFull } from '@zaviya/shared'
import { SITE } from '@zaviya/shared'
import { absoluteUrl } from '@/lib/seo'
import { escapeHtml, STORY_POSTER_HEIGHT, STORY_POSTER_WIDTH, storyPosterUrl } from '@/lib/web-story'

/** ZAV-242: Google Web Stories at /web-stories/<slug>: a daily "5 big stories" digest plus one story per breaking article. */

export const WEB_STORY_DAYS = 7 // same window as the sitemap's articles
export const DIGEST_SIZE = 5
export const DIGEST_MIN = 3
export const BREAKING_PER_DAY = 3
export const STORIES_CACHE_CONTROL = 'public, max-age=0, s-maxage=300, stale-while-revalidate=600'

export interface StoryDigest {
  /** Pakistan calendar day, YYYY-MM-DD */
  date: string
  top: ArticleCard[]
  breaking: ArticleCard[]
}

/** The Pakistan (UTC+5, no DST) calendar day of an instant, as YYYY-MM-DD. */
export function pktDate(iso: string | Date): string {
  return new Date(new Date(iso).getTime() + 5 * 3_600_000).toISOString().slice(0, 10)
}

export const dailyStorySlug = (date: string): string => `daily-${date}`

/** 'daily-2026-10-28' -> '2026-10-28', anything else -> null. */
export function parseDailyStorySlug(slug: string): string | null {
  const m = /^daily-(\d{4}-\d{2}-\d{2})$/.exec(slug)
  return m ? m[1] : null
}

export const webStoriesPath = (slug?: string): string => (slug ? `/web-stories/${slug}` : '/web-stories')

const RANK: Record<string, number> = { breaking: 3, high: 2, normal: 1 }

/** Whether an article has enough text for a story page. */
export const storyReady = (a: Pick<ArticleCard, 'title' | 'dek'>): boolean => Boolean(a.title && a.dek)

/** Groups cards by Pakistan day; per day the top DIGEST_SIZE (priority, then hero image, then newest) and up to 3 breaking. Newest day first. */
export function groupStoryDigests(cards: ArticleCard[]): StoryDigest[] {
  const byDay = new Map<string, ArticleCard[]>()
  for (const c of cards) {
    if (!storyReady(c)) continue
    const day = pktDate(c.publishedAt)
    byDay.set(day, [...(byDay.get(day) ?? []), c])
  }
  return [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, list]) => {
      const ranked = [...list].sort(
        (a, b) =>
          (RANK[String(b.priority ?? 'normal')] ?? 1) - (RANK[String(a.priority ?? 'normal')] ?? 1) ||
          Number(Boolean(b.image)) - Number(Boolean(a.image)) ||
          b.publishedAt.localeCompare(a.publishedAt),
      )
      const breaking = list
        .filter((c) => c.isBreaking || c.priority === 'breaking')
        .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
        .slice(0, BREAKING_PER_DAY)
      return { date, top: ranked.slice(0, DIGEST_SIZE), breaking }
    })
}

export function digestTitle(date: string): string {
  const d = new Date(`${date}T12:00:00Z`)
  const label = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(d)
  return `Today's 5 big stories in Pakistan, ${label}`
}

interface StoryPage {
  headline: string
  text?: string
  poster: string
  /** page links to the article */
  href?: string
}

const BOILERPLATE =
  '<style amp-boilerplate>body{-webkit-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-moz-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-ms-animation:-amp-start 8s steps(1,end) 0s 1 normal both;animation:-amp-start 8s steps(1,end) 0s 1 normal both}@-webkit-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-moz-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-ms-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-o-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}</style><noscript><style amp-boilerplate>body{-webkit-animation:none;-moz-animation:none;-ms-animation:none;animation:none}</style></noscript>'

/** A standalone AMP story that is its own canonical (Google indexes the story itself, not the article). Cover, one page per item, closing page. */
export function renderStory(opts: { slug: string; title: string; poster: string; pages: StoryPage[]; closingHref: string }): string {
  const publisher = SITE.brandName
  const canonical = absoluteUrl(webStoriesPath(opts.slug))
  const title = escapeHtml(opts.title)
  const img = (src: string, alt: string) =>
    `<amp-img src="${escapeHtml(src)}" width="${STORY_POSTER_WIDTH}" height="${STORY_POSTER_HEIGHT}" layout="responsive" alt="${escapeHtml(alt)}"></amp-img>`
  const outlink = (href: string, label: string) =>
    `<amp-story-page-outlink layout="nodisplay"><a href="${escapeHtml(href)}">${escapeHtml(label)}</a></amp-story-page-outlink>`
  const pages = opts.pages
    .map(
      (p, i) => `
    <amp-story-page id="item-${i + 1}" auto-advance-after="7s">
      <amp-story-grid-layer template="fill">${img(p.poster, '')}</amp-story-grid-layer>
      <amp-story-grid-layer template="vertical" class="shade">
        <h2>${escapeHtml(p.headline)}</h2>
        ${p.text ? `<p>${escapeHtml(p.text)}</p>` : ''}
      </amp-story-grid-layer>
      ${p.href ? outlink(p.href, 'Read the full story') : ''}
    </amp-story-page>`,
    )
    .join('')
  return `<!doctype html>
<html ⚡ lang="en">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta name="viewport" content="width=device-width,minimum-scale=1,initial-scale=1">
  <script async src="https://cdn.ampproject.org/v0.js"></script>
  <script async custom-element="amp-story" src="https://cdn.ampproject.org/v0/amp-story-1.0.js"></script>
  ${BOILERPLATE}
  <style amp-custom>
    amp-story-page { background: #0a0a0a; color: #fff; font-family: system-ui, sans-serif; }
    .shade { background: linear-gradient(to top, rgba(0,0,0,.85), rgba(0,0,0,0) 70%); align-content: end; }
    h1 { font-size: 2rem; line-height: 1.25; margin: 0; padding: 1rem; }
    h2 { font-size: 1.5rem; line-height: 1.3; margin: 0; padding: 1rem 1.25rem .25rem; }
    p { font-size: 1.1rem; line-height: 1.4; margin: 0; padding: .25rem 1.25rem 1.5rem; }
  </style>
</head>
<body>
  <amp-story standalone
    title="${title}"
    publisher="${escapeHtml(publisher)}"
    publisher-logo-src="${escapeHtml(absoluteUrl('/logo.png'))}"
    poster-portrait-src="${escapeHtml(opts.poster)}">
    <amp-story-page id="cover" auto-advance-after="5s">
      <amp-story-grid-layer template="fill">${img(opts.poster, '')}</amp-story-grid-layer>
      <amp-story-grid-layer template="vertical" class="shade">
        <h1>${title}</h1>
      </amp-story-grid-layer>
    </amp-story-page>${pages}
    <amp-story-page id="cta">
      <amp-story-grid-layer template="vertical">
        <h2>More news on ${escapeHtml(SITE.brandName)}</h2>
        <p>${escapeHtml(SITE.tagline)}</p>
      </amp-story-grid-layer>
      ${outlink(opts.closingHref, 'Open zaviya.pk')}
    </amp-story-page>
  </amp-story>
</body>
</html>`
}

const toPage = (a: ArticleCard): StoryPage => ({ headline: a.title, text: a.dek, poster: storyPosterUrl(a), href: absoluteUrl(a.href) })

export function buildDigestStory(d: StoryDigest): string {
  return renderStory({
    slug: dailyStorySlug(d.date),
    title: digestTitle(d.date),
    poster: storyPosterUrl(d.top[0]),
    pages: d.top.map(toPage),
    closingHref: absoluteUrl('/latest'),
  })
}

/** One story for one breaking article: headline, dek, key points, link to the article. */
export function buildBreakingStory(a: ArticleFull): string {
  const poster = storyPosterUrl(a)
  const pages: StoryPage[] = [
    { headline: a.title, text: a.dek, poster },
    ...a.keyPoints.slice(0, 5).map((k) => ({ headline: k, poster })),
  ]
  pages[pages.length - 1].href = absoluteUrl(a.href)
  return renderStory({ slug: a.slug, title: a.title, poster, pages, closingHref: absoluteUrl(a.href) })
}
