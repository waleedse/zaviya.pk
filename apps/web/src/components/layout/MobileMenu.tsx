'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Menu, X } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { SITE, type CategoryRef, type Locale } from '@zaviya/shared'
import { localePath, t, urduEnabled } from '@/lib/i18n'
import { categoryIcon } from '@/lib/category-icons'
import { TOOLS } from '@/components/home/tools'
import { cn } from '@/lib/utils'

/** Full-screen section menu for phones. */
export function MobileMenu({ locale, categories, langHref }: { locale: Locale; categories: CategoryRef[]; langHref: string }) {
  const d = t(locale)
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  const isUr = locale === 'ur'
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger
        className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface text-fg hover:border-accent hover:text-accent"
        aria-label={d.openMenu}
      >
        <Menu className="h-5 w-5" />
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <DialogPrimitive.Content
          className="fixed inset-y-0 end-0 z-50 flex w-[min(88vw,380px)] flex-col overflow-y-auto bg-bg shadow-2xl outline-none"
          aria-describedby={undefined}
        >
          <div className="flex h-14 items-center justify-between border-b border-border px-5">
            <DialogPrimitive.Title className="font-display text-lg font-bold">{isUr ? SITE.nameUr : SITE.name}</DialogPrimitive.Title>
            <DialogPrimitive.Close className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-surface-2" aria-label="Close">
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>
          <nav className="flex-1 px-2 py-3" aria-label="Sections">
            <Link href={localePath(locale, '/')} onClick={close} className="flex items-center rounded-lg px-3 py-3 text-lg font-semibold hover:bg-surface-2">
              {d.nav.home}
            </Link>
            <Link href={localePath(locale, '/live')} onClick={close} className="flex items-center gap-2 rounded-lg px-3 py-3 text-lg font-semibold hover:bg-surface-2">
              <span className="live-dot" /> {d.nav.live}
            </Link>
            <div className="my-2 border-t border-border" />
            {categories.map((c) => {
              const Icon = categoryIcon(c.slug)
              return (
                <Link
                  key={c.slug}
                  href={localePath(locale, `/${c.slug}`)}
                  onClick={close}
                  className="flex items-center gap-3 rounded-lg px-3 py-3 text-[1.05rem] font-medium hover:bg-surface-2"
                >
                  <Icon className="h-5 w-5" style={{ color: c.color }} aria-hidden />
                  {c.name}
                </Link>
              )
            })}
            <div className="my-2 border-t border-border" />
            <p className="px-3 pb-2 pt-2 text-xs font-bold uppercase tracking-widest text-fg-subtle">{isUr ? 'روزمرہ ٹولز' : 'Daily tools'}</p>
            <div className="grid grid-cols-2 gap-2 px-2">
              {TOOLS.map((tool) => (
                <Link
                  key={tool.path}
                  href={localePath(locale, tool.path)}
                  onClick={close}
                  className="flex items-center gap-2 rounded-xl bg-surface p-2 text-sm font-semibold"
                >
                  <span className={cn('icon-tile h-8 w-8', tool.tile)}>
                    <tool.icon className="h-4 w-4" aria-hidden />
                  </span>
                  {isUr ? tool.ur : tool.en}
                </Link>
              ))}
            </div>
          </nav>
          {urduEnabled() && <div className="border-t border-border p-5">
            <Link
              href={langHref}
              onClick={close}
              hrefLang={isUr ? 'en' : 'ur'}
              className="flex w-full items-center justify-center rounded-full bg-accent px-4 py-3 font-semibold text-accent-fg"
            >
              {isUr ? 'Read in English' : 'اردو میں پڑھیں'}
            </Link>
          </div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
