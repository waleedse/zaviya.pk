import type { Locale } from '@zaviya/shared'
import { Button } from '@/components/ui/button'
import { t } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export function WhatsAppCTA({ locale, compact }: { locale: Locale; compact?: boolean }) {
  const d = t(locale)
  const href = 'https://wa.me/channel/0000000000'
  if (compact) {
    return (
      <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
        <p className="text-sm text-fg-muted">{d.whatsapp.desc}</p>
        <Button asChild size="sm" className="bg-[#25D366] text-white hover:bg-[#25D366]/90">
          <a href={href} target="_blank" rel="noopener noreferrer">
            {d.whatsapp.cta}
          </a>
        </Button>
      </div>
    )
  }
  return (
    <div className={cn('rounded-[var(--radius-card)] border border-border bg-surface p-8 text-center md:text-start')}>
      <h2 className="font-display text-h2 font-semibold">{d.whatsapp.title}</h2>
      <p className="mt-2 text-fg-muted">{d.whatsapp.desc}</p>
      <Button asChild className="mt-4 bg-[#25D366] text-white hover:bg-[#25D366]/90">
        <a href={href} target="_blank" rel="noopener noreferrer">
          {d.whatsapp.cta}
        </a>
      </Button>
    </div>
  )
}
