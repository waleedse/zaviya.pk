/**
 * Media.credit for real photos is "Photo: Author / CC BY-SA 4.0 / Wikimedia Commons | <file page URL>" (no extra column, so no
 * migration). Photos found through Openverse carry their landing page (Flickr, Commons, ...) the same way. Readers see the
 * text; the page becomes the link that licences ask for. Only plain https links are linked.
 */
export function creditParts(credit: string): { text: string; href?: string } {
  const [text = '', url] = credit.split(' | ')
  const href = url?.trim()
  return { text: text.trim(), href: href && /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}\/\S*$/i.test(href) ? href : undefined }
}
