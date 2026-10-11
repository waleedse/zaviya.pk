import type { Locale } from '@zaviya/shared'
import { t } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/** Renders only once a real channel link is configured (NEXT_PUBLIC_WHATSAPP_CHANNEL_URL). */
export function WhatsAppCTA({ locale, compact }: { locale: Locale; compact?: boolean }) {
  const href = process.env.NEXT_PUBLIC_WHATSAPP_CHANNEL_URL
  if (!href) return null
  const d = t(locale)
  const icon = (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
      <path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.8.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3 2.4 1 2.9.8 3.4.7.5-.1 1.7-.7 1.9-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.3zM12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2z" />
    </svg>
  )
  if (compact) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-full bg-whatsapp px-4 py-2 text-sm font-semibold text-white hover:brightness-95"
      >
        {icon}
        {d.whatsapp.cta}
      </a>
    )
  }
  return (
    <section className={cn('overflow-hidden rounded-[var(--radius-card)] bg-[#0b3d2c] text-white')}>
      <div className="flex flex-col items-start gap-5 p-7 md:flex-row md:items-center md:justify-between md:p-9">
        <div>
          <h2 className="font-display text-h2 font-bold">{d.whatsapp.title}</h2>
          <p className="mt-1 text-white/75">{d.whatsapp.desc}</p>
        </div>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-whatsapp px-6 py-3 font-semibold text-white hover:brightness-95"
        >
          {icon}
          {d.whatsapp.cta}
        </a>
      </div>
    </section>
  )
}
