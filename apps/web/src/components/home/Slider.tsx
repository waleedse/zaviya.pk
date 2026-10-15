'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * A horizontal row of cards the reader moves with arrows, swipe or trackpad. Every card is in the
 * server HTML (crawlable); this only scrolls the row. Nothing moves on its own.
 */
export function Slider({
  children,
  labels,
  itemClass = 'w-[78%] sm:w-[calc((100%-1.25rem)/2)] lg:w-[calc((100%-3.75rem)/4)]',
  tone = 'light',
}: {
  children: ReactNode[]
  labels: { prev: string; next: string }
  itemClass?: string
  tone?: 'light' | 'dark'
}) {
  const row = useRef<HTMLDivElement>(null)
  const [edge, setEdge] = useState({ start: true, end: false })

  const update = useCallback(() => {
    const el = row.current
    if (!el) return
    const x = Math.abs(el.scrollLeft)
    setEdge({ start: x < 8, end: x + el.clientWidth >= el.scrollWidth - 8 })
  }, [])

  useEffect(() => {
    update()
    const el = row.current
    if (!el) return
    el.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      el.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [update])

  const go = (dir: 1 | -1) => {
    const el = row.current
    if (!el) return
    const rtl = getComputedStyle(el).direction === 'rtl'
    el.scrollBy({ left: dir * (rtl ? -1 : 1) * el.clientWidth * 0.9, behavior: 'smooth' })
  }

  const btn = cn(
    'flex h-11 w-11 items-center justify-center rounded-full border transition disabled:opacity-35',
    tone === 'dark' ? 'border-ink-line bg-ink-2 text-ink-fg hover:bg-ink-line' : 'border-border bg-surface text-fg hover:border-accent hover:text-accent',
  )

  return (
    <div>
      <div ref={row} className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth px-4 pb-1 md:mx-0 md:px-0">
        {children.map((child, i) => (
          <div key={i} className={cn('shrink-0 snap-start', itemClass)}>
            {child}
          </div>
        ))}
      </div>
      {children.length > 1 && (
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" aria-label={labels.prev} onClick={() => go(-1)} disabled={edge.start} className={btn}>
            <ChevronLeft className="h-5 w-5 rtl:rotate-180" aria-hidden />
          </button>
          <button type="button" aria-label={labels.next} onClick={() => go(1)} disabled={edge.end} className={btn}>
            <ChevronRight className="h-5 w-5 rtl:rotate-180" aria-hidden />
          </button>
        </div>
      )}
    </div>
  )
}
