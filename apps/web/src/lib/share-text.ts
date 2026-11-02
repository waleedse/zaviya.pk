import { SITE } from '@zaviya/shared'

/** The domain printed on the share card and in shared text (ZAV-300). */
export const SHARE_DOMAIN = 'zaviya.pk'

/** "Zaviya News (zaviya.pk)": the brand people see in a forwarded message and can search for. Same for English and Urdu readers. */
export const SHARE_BRAND = `${SITE.brandName} (${SHARE_DOMAIN})`

/** Headline plus brand: "<headline> - Zaviya News (zaviya.pk)" */
export function shareLine(title: string): string {
  return `${title.replace(/\s+/g, ' ').trim()} - ${SHARE_BRAND}`
}

/** The text of a WhatsApp / native / picture share: the branded headline, then the link on its own line. */
export function shareText(title: string, url: string): string {
  return `${shareLine(title)}\n${url}`
}
