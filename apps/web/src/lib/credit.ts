/**
 * Media.credit for Wikimedia Commons photos is "Photo: Author / CC BY-SA 4.0 / Wikimedia Commons | <file page URL>"
 * (no extra column, so no migration). Readers see the text; the file page becomes the link that licences ask for.
 */
export function creditParts(credit: string): { text: string; href?: string } {
  const [text = '', url] = credit.split(' | ')
  const href = url?.trim()
  return { text: text.trim(), href: href && /^https:\/\/commons\.wikimedia\.org\/wiki\/File:\S+$/.test(href) ? href : undefined }
}
