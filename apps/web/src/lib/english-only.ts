import { redirect } from 'next/navigation'
import type { Locale } from '@zaviya/shared'

/** These pages exist in English only: the Urdu URL sends readers to the English page instead of showing mixed languages. */
export function englishOnly(locale: Locale, enPath: string): void {
  if (locale === 'ur') redirect(enPath)
}
