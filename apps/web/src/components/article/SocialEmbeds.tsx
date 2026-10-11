import Script from 'next/script'
import type { Locale } from '@zaviya/shared'

type Embed = { type: 'x' | 'instagram' | 'youtube'; url: string }

/** Official embeds of the posts a story came from (the platforms host the media, we don't). */
export function SocialEmbeds({ embeds, locale }: { embeds: Embed[]; locale: Locale }) {
  if (!embeds.length) return null
  const hasX = embeds.some((e) => e.type === 'x')
  const hasIg = embeds.some((e) => e.type === 'instagram')
  return (
    <section className="my-10 space-y-6" aria-label={locale === 'ur' ? 'سوشل میڈیا' : 'From social media'}>
      {embeds.map((e) => {
        if (e.type === 'x') {
          return (
            <blockquote key={e.url} className="twitter-tweet" data-dnt="true" data-theme="light">
              <a href={e.url}>{e.url}</a>
            </blockquote>
          )
        }
        if (e.type === 'instagram') {
          return (
            <blockquote key={e.url} className="instagram-media" data-instgrm-permalink={e.url} data-instgrm-version="14" style={{ maxWidth: 540, width: '100%' }}>
              <a href={e.url}>{e.url}</a>
            </blockquote>
          )
        }
        const id = /(?:v=|youtu\.be\/)([\w-]{11})/.exec(e.url)?.[1]
        return id ? (
          <div key={e.url} className="relative aspect-video overflow-hidden rounded-[var(--radius-image)]">
            <iframe
              className="absolute inset-0 h-full w-full"
              src={`https://www.youtube-nocookie.com/embed/${id}`}
              title="YouTube video"
              loading="lazy"
              allow="accelerometer; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : null
      })}
      {hasX && <Script src="https://platform.twitter.com/widgets.js" strategy="lazyOnload" />}
      {hasIg && <Script src="https://www.instagram.com/embed.js" strategy="lazyOnload" />}
    </section>
  )
}
