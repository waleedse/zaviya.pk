/** Every social post sends people to the article: that is the traffic. */
export const SITE_ORIGIN = (process.env.SITE_URL || 'https://zaviya.pk').replace(/\/$/, '')

export function articleUrl(category: string, slug: string, origin = SITE_ORIGIN): string {
  return `${origin}/${category}/${slug}`
}

/** Adds the article link (or, on Instagram where links are not clickable, the site name) once. */
export function withLink(text: string, url: string | undefined, platform: 'facebook' | 'instagram' | 'x'): string {
  const t = text.trim()
  if (!url || t.includes(url)) return t
  if (platform === 'x') return `${t} ${url}`
  if (platform === 'instagram') return `${t}\n\nFull story: zaviya.pk (link in bio)`
  return `${t}\n\nRead the full story: ${url}`
}

/** The designed post card goes everywhere; without it, the wide card suits Facebook and X and Instagram takes the portrait. */
export function pickCard(mediaUrls: string[], platform: 'facebook' | 'instagram' | 'x'): string | undefined {
  const post = mediaUrls.find((u) => /-post(-\d+)?\.(png|jpe?g)$/i.test(u))
  if (post) return post
  const wide = mediaUrls.find((u) => /-card(-\d+)?\.(png|jpe?g)$/i.test(u))
  const portrait = mediaUrls.find((u) => /-portrait(-\d+)?\.(png|jpe?g)$/i.test(u))
  return platform === 'instagram' ? portrait ?? mediaUrls[0] : wide ?? mediaUrls[0]
}

/** Keeps the first `max` hashtags and drops the rest (growth strategy: 1-3 relevant tags, not a wall of them). */
export function limitHashtags(text: string, max: number): string {
  let n = 0
  return text
    .replace(/(^|\s)#[\p{L}\p{N}_]+/gu, (m, lead: string) => (++n > max ? '' : m))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

/** The Facebook caption when the link goes into the first comment: no URL and no "Read the full story" line. */
export function captionWithoutLink(text: string, url: string | undefined): string {
  let t = text
  if (url) t = t.split(url).join('')
  return t
    .replace(/^.*read the full story:?\s*$/gim, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
