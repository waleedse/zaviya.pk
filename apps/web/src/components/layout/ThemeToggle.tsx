'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import type { Locale } from '@zaviya/shared'

export function ThemeToggle({ locale }: { locale: Locale }) {
  const { resolvedTheme, setTheme } = useTheme()
  // The label is static so server and client HTML match; the icon swaps with CSS.
  return (
    <button
      type="button"
      className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface text-fg hover:border-accent hover:text-accent"
      aria-label={locale === 'ur' ? 'تھیم تبدیل کریں' : 'Toggle dark mode'}
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      <Sun className="h-[18px] w-[18px] dark:hidden" />
      <Moon className="hidden h-[18px] w-[18px] dark:block" />
    </button>
  )
}
