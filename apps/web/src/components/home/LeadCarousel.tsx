'use client'

import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const INTERVAL_MS = 6_500

/**
 * The lead slot as a moving strip: every few seconds the next story fades in over it and the
 * row of headlines under it shows what is coming. Pauses on hover, focus or a hidden tab, swipes on
 * touch, and stands still for readers who prefer reduced motion. All slides are in the server HTML.
 */
export function LeadCarousel({ children, titles, labels }: { children: ReactNode; titles: string[]; labels: { prev: string; next: string; slide: string } }) {
  const slides = Children.toArray(children)
  const count = slides.length
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [reduced, setReduced] = useState(false)
  const touchX = useRef<number | null>(null)

  const go = useCallback((n: number) => setIndex((i) => (((i + n) % count) + count) % count), [count])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onVis = () => setPaused(document.hidden)
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  useEffect(() => {
    if (paused || reduced || count < 2) return
    const t = setTimeout(() => go(1), INTERVAL_MS)
    return () => clearTimeout(t)
  }, [index, paused, reduced, count, go])

  if (count < 2) return <>{slides}</>

  return (
    <div
      className="group/lead relative"
      role="region"
      aria-roledescription="carousel"
      aria-label={labels.slide}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onTouchStart={(e) => (touchX.current = e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return
        const dx = (e.changedTouches[0]?.clientX ?? 0) - touchX.current
        const rtl = document.dir === 'rtl'
        if (Math.abs(dx) > 40) go((dx < 0) !== rtl ? 1 : -1)
        touchX.current = null
      }}
    >
      {/* Slides share one cell and crossfade, so wrapping from the last story to the first never
          rewinds the strip, and the slot keeps the height of the tallest card */}
      <div className="grid overflow-hidden rounded-[var(--radius-card)]">
        {slides.map((slide, i) => (
          <div
            key={i}
            className={cn(
              'col-start-1 row-start-1 w-full ease-in-out motion-reduce:transition-none',
              i === index ? 'z-10 opacity-100 transition-opacity duration-700' : 'pointer-events-none z-0 opacity-0 transition-opacity delay-700 duration-100',
            )}
            aria-hidden={i !== index}
            inert={i !== index}
          >
            {slide}
          </div>
        ))}
      </div>

      <button
        type="button"
        aria-label={labels.prev}
        onClick={() => go(-1)}
        className="absolute start-3 top-1/3 z-20 hidden h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white opacity-0 backdrop-blur transition hover:bg-black/65 group-hover/lead:opacity-100 md:flex"
      >
        <ChevronLeft className="h-5 w-5 rtl:rotate-180" aria-hidden />
      </button>
      <button
        type="button"
        aria-label={labels.next}
        onClick={() => go(1)}
        className="absolute end-3 top-1/3 z-20 hidden h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white opacity-0 backdrop-blur transition hover:bg-black/65 group-hover/lead:opacity-100 md:flex"
      >
        <ChevronRight className="h-5 w-5 rtl:rotate-180" aria-hidden />
      </button>

      {/* What is coming: each tab fills while its story is on screen, and picks it on click */}
      <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }} role="tablist">
        {titles.map((title, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={`${labels.slide} ${i + 1}: ${title}`}
            onClick={() => setIndex(i)}
            className="group/tab min-w-0 text-start"
          >
            <span className="block h-1 overflow-hidden rounded-full bg-border">
              <span
                key={`${index}-${paused}`}
                className={cn(
                  'block h-full rounded-full bg-accent',
                  i < index && 'w-full',
                  i > index && 'w-0',
                  i === index && (paused || reduced ? 'w-full' : 'w-0 animate-[slider-progress_6.5s_linear_forwards]'),
                )}
              />
            </span>
            <span
              className={cn(
                'mt-1.5 hidden text-[12.5px] font-semibold leading-snug xl:block',
                i === index ? 'text-fg' : 'text-fg-subtle group-hover/tab:text-fg-muted',
              )}
            >
              <span className="line-clamp-2">{title}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
