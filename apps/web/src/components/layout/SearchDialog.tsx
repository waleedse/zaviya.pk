'use client'

import { Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import type { Locale } from '@zaviya/shared'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { t, localePath } from '@/lib/i18n'

export function SearchDialog({ locale }: { locale: Locale }) {
  const d = t(locale)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const router = useRouter()

  const submit = useCallback(() => {
    const query = q.trim()
    if (!query) return
    router.push(`${localePath(locale, '/search')}?q=${encodeURIComponent(query)}`)
    setOpen(false)
  }, [q, router, locale])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={d.openSearch}>
          <Search className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="p-4 pt-12">
        <label className="sr-only" htmlFor="search-dialog">
          {d.search}
        </label>
        <input
          id="search-dialog"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder={d.searchPlaceholder}
          className="h-12 w-full rounded-[var(--radius-input)] border border-border bg-surface-2 px-4 text-base outline-none focus:border-accent"
        />
        <p className="mt-2 text-xs text-fg-muted">⌘K</p>
      </DialogContent>
    </Dialog>
  )
}
