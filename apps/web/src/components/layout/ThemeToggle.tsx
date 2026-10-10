'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import type { Locale } from '@zaviya/shared'
import { t } from '@/lib/i18n'

export function ThemeToggle({ locale }: { locale: Locale }) {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const d = t(locale)
  const isDark = (theme === 'system' ? resolvedTheme : theme) === 'dark'
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={isDark ? d.themeLight : d.themeDark}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      <Sun className="h-4 w-4 dark:hidden" />
      <Moon className="hidden h-4 w-4 dark:block" />
    </Button>
  )
}
