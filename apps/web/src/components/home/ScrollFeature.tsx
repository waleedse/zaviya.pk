'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * A desk as a scroll story: the big card on the start side stays in view (sticky, large screens)
 * and turns into whichever story in the list beside it is crossing the middle of the screen, with
 * a fade, lift and image zoom; the active row shows how far the reader has scrolled through it.
 * Hover or focus on a row shows it at once. Small screens keep the first story as the big card
 * (it is out of view while the list scrolls). Readers who prefer reduced motion get no movement.
 * The server renders every card and row; this only decides which one is shown.
 */
export function ScrollFeature({
  features,
  rows,
  accent,
  tone = 'light',
  counter,
}: {
  /** One big card per story, same order as `rows` */
  features: ReactNode[]
  rows: ReactNode[]
  /** Desk colour for the progress bar and the active row */
  accent: string
  tone?: 'light' | 'dark'
  /** e.g. "of" for "02 of 07" */
  counter?: string
}) {
  const count = Math.min(features.length, rows.length)
  const [active, setActive] = useState(0)
  const [progress, setProgress] = useState(0)
  const rowRefs = useRef<(HTMLLIElement | null)[]>([])
  const pinned = useRef<number | null>(null)
  const wide = useRef(false)

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    let raf = 0
    const measure = () => {
      raf = 0
      wide.current = mq.matches
      if (!wide.current) {
        setActive(0)
        setProgress(0)
        return
      }
      if (pinned.current !== null) return
      const mid = window.innerHeight * 0.5
      let idx = 0
      let prog = 0
      rowRefs.current.forEach((el, i) => {
        if (!el) return
        const r = el.getBoundingClientRect()
        if (r.top <= mid) {
          idx = i
          prog = Math.min(1, Math.max(0, (mid - r.top) / Math.max(1, r.height)))
        }
      })
      setActive(idx)
      setProgress(prog)
    }
    const onScroll = () => {
      // Scrolling takes over from a hovered row (rows slide under a still mouse while scrolling)
      pinned.current = null
      if (!raf) raf = requestAnimationFrame(measure)
    }
    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    mq.addEventListener('change', onScroll)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      mq.removeEventListener('change', onScroll)
    }
  }, [])

  const pin = (i: number | null) => {
    if (!wide.current) return
    if (i === null) {
      pinned.current = null
      window.dispatchEvent(new Event('scroll'))
      return
    }
    if (pinned.current === i) return
    pinned.current = i
    setActive(i)
    setProgress(1)
  }

  const pad = (n: number) => String(n).padStart(2, '0')
  const dark = tone === 'dark'

  return (
    <div className="grid gap-x-8 gap-y-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <div className="lg:sticky lg:top-24 lg:self-start">
        <div className="grid">
          {features.slice(0, count).map((f, i) => {
            const on = i === active
            return (
              <div
                key={i}
                aria-hidden={!on}
                inert={!on}
                className={cn(
                  '[grid-area:1/1] transition-[opacity,transform,filter] duration-700 ease-[cubic-bezier(.2,.75,.15,1)] motion-reduce:transition-none',
                  '[&_img]:transition-transform [&_img]:duration-[1200ms] [&_img]:ease-out motion-reduce:[&_img]:transition-none',
                  on
                    ? 'z-10 translate-y-0 opacity-100 blur-0 [&_img]:scale-100'
                    : cn('pointer-events-none opacity-0 blur-[6px] [&_img]:scale-110', i < active ? '-translate-y-5' : 'translate-y-5'),
                )}
              >
                {f}
              </div>
            )
          })}
        </div>
        {count > 1 && (
          <div className="mt-4 hidden items-center gap-3 lg:flex" aria-hidden>
            <span className={cn('font-display text-sm font-extrabold tabular-nums', dark ? 'text-ink-fg' : 'text-fg')}>
              {pad(active + 1)}
              <span className={cn('font-bold', dark ? 'text-ink-muted' : 'text-fg-subtle')}>
                {' '}
                {counter ?? '/'} {pad(count)}
              </span>
            </span>
            <span className="flex flex-1 gap-1.5">
              {Array.from({ length: count }, (_, i) => (
                <span key={i} className={cn('h-1 flex-1 overflow-hidden rounded-full', dark ? 'bg-ink-line' : 'bg-border')}>
                  <span
                    className="block h-full origin-left rounded-full transition-transform duration-300 ease-out rtl:origin-right motion-reduce:transition-none"
                    style={{ background: accent, transform: `scaleX(${i < active ? 1 : i === active ? Math.max(progress, 0.08) : 0})` }}
                  />
                </span>
              ))}
            </span>
          </div>
        )}
      </div>

      <ol className={cn('divide-y', dark ? 'divide-ink-line' : 'divide-border')} onMouseLeave={() => pin(null)}>
        {rows.slice(0, count).map((r, i) => {
          const on = i === active
          return (
            <li
              key={i}
              ref={(el) => {
                rowRefs.current[i] = el
              }}
              onPointerMove={(e) => e.pointerType === 'mouse' && pin(i)}
              onFocus={() => pin(i)}
              onBlur={() => pin(null)}
              className={cn(
                'relative ps-4 transition-[background-color,transform] duration-500 ease-out lg:min-h-[150px] motion-reduce:transition-none',
                // Small screens show the first story as the big card above: no second copy in the list
                i === 0 && 'max-lg:hidden',
                on ? 'lg:translate-x-1 rtl:lg:-translate-x-1' : 'lg:opacity-70',
              )}
              style={on ? { background: `color-mix(in oklab, ${accent} ${dark ? 14 : 7}%, transparent)` } : undefined}
            >
              <span className={cn('absolute bottom-3 start-0 top-3 w-[3px] overflow-hidden rounded-full', dark ? 'bg-ink-line' : 'bg-border')} aria-hidden>
                <span
                  className="block h-full w-full origin-top transition-transform duration-200 ease-out motion-reduce:transition-none"
                  style={{ background: accent, transform: `scaleY(${i < active ? 1 : on ? Math.max(progress, 0.06) : 0})` }}
                />
              </span>
              {r}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
