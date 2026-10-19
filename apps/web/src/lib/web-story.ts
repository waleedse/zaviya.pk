import type { ArticleFull } from '@zaviya/shared'
import { SITE } from '@zaviya/shared'
import { absoluteUrl } from '@/lib/seo'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function canBuildWebStory(article: ArticleFull): boolean {
  return Boolean(article.title && (article.dek || article.keyPoints.length > 0))
}

/** Google wants a 3:4 portrait poster of at least 640x853; this is served by /api/story-poster (cropped hero) or /api/og?variant=story. */
export const STORY_POSTER_WIDTH = 720
export const STORY_POSTER_HEIGHT = 960

export function storyPosterUrl(article: ArticleFull): string {
  if (article.image?.url) return absoluteUrl(`/api/story-poster?src=${encodeURIComponent(article.image.url)}`)
  const q = new URLSearchParams({
    title: article.title,
    kicker: article.category?.name ?? 'Zaviya',
    category: article.category?.slug ?? 'news',
    variant: 'story',
  })
  return absoluteUrl(`/api/og?${q.toString()}`)
}

export function webStoryPath(slug: string): string {
  return `/stories/${slug}`
}

export function buildWebStoryHtml(article: ArticleFull, locale: string, canonicalArticlePath: string): string {
  const publisher = locale === 'ur' ? SITE.nameUr : SITE.brandName
  const canonical = absoluteUrl(canonicalArticlePath)
  const poster = storyPosterUrl(article)
  const title = escapeHtml(article.title)
  const dek = article.dek ? escapeHtml(article.dek) : ''

  const pointPages = article.keyPoints.slice(0, 8).map((point, i) => {
    const text = escapeHtml(point)
    return `
    <amp-story-page id="point-${i + 1}" auto-advance-after="5s">
      <amp-story-grid-layer template="vertical">
        <h2>${text}</h2>
      </amp-story-grid-layer>
    </amp-story-page>`
  })

  const dekPage =
    dek && article.keyPoints.length === 0
      ? `
    <amp-story-page id="dek" auto-advance-after="6s">
      <amp-story-grid-layer template="fill">
        <amp-img src="${escapeHtml(poster)}" width="${STORY_POSTER_WIDTH}" height="${STORY_POSTER_HEIGHT}" layout="responsive"></amp-img>
      </amp-story-grid-layer>
      <amp-story-grid-layer template="vertical">
        <p>${dek}</p>
      </amp-story-grid-layer>
    </amp-story-page>`
      : ''

  return `<!doctype html>
<html ⚡ lang="${locale}">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta name="viewport" content="width=device-width,minimum-scale=1,initial-scale=1">
  <script async src="https://cdn.ampproject.org/v0.js"></script>
  <script async custom-element="amp-story" src="https://cdn.ampproject.org/v0/amp-story-1.0.js"></script>
  <style amp-boilerplate>body{-webkit-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-moz-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-ms-animation:-amp-start 8s steps(1,end) 0s 1 normal both;animation:-amp-start 8s steps(1,end) 0s 1 normal both}@-webkit-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-moz-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-ms-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-o-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}</style>
  <noscript><style amp-boilerplate>body{-webkit-animation:none;-moz-animation:none;-ms-animation:none;animation:none}</style></noscript>
  <style amp-custom>
    amp-story-page { background: #0a0a0a; color: #fff; font-family: system-ui, sans-serif; }
    h1 { font-size: 2rem; margin: 0; padding: 1rem; }
    h2 { font-size: 1.5rem; line-height: 1.35; padding: 2rem 1.5rem; }
    p { font-size: 1.25rem; line-height: 1.4; padding: 2rem 1.5rem; }
  </style>
</head>
<body>
  <amp-story standalone
    title="${title}"
    publisher="${escapeHtml(publisher)}"
    publisher-logo-src="${escapeHtml(absoluteUrl('/logo.png'))}"
    poster-portrait-src="${escapeHtml(poster)}">
    <amp-story-page id="cover" auto-advance-after="7s">
      <amp-story-grid-layer template="fill">
        <amp-img src="${escapeHtml(poster)}" width="${STORY_POSTER_WIDTH}" height="${STORY_POSTER_HEIGHT}" layout="responsive" alt=""></amp-img>
      </amp-story-grid-layer>
      <amp-story-grid-layer template="vertical">
        <h1>${title}</h1>
        ${dek ? `<p>${dek}</p>` : ''}
      </amp-story-grid-layer>
    </amp-story-page>
    ${dekPage}
    ${pointPages.join('\n')}
    <amp-story-page id="cta" auto-advance-after="8s">
      <amp-story-grid-layer template="vertical">
        <h2>${locale === 'ur' ? 'مکمل خبر پڑھیں' : 'Read the full story'}</h2>
        <p><a href="${escapeHtml(canonical)}">${escapeHtml(publisher)}</a></p>
      </amp-story-grid-layer>
    </amp-story-page>
  </amp-story>
</body>
</html>`
}
