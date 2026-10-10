import { Badge } from '@/components/ui/badge'
import type { Locale } from '@zaviya/shared'
import { t } from '@/lib/i18n'

export function LiveBadge({ locale, breaking }: { locale: Locale; breaking?: boolean }) {
  const d = t(locale)
  return (
    <Badge variant="live" className="gap-1.5 uppercase tracking-wide">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-breaking opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-breaking" />
      </span>
      {breaking ? d.breaking : d.live}
    </Badge>
  )
}
