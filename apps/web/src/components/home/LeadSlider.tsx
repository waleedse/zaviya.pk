'use client'

import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const INTERVAL_MS = 6_000

/**
 * The lead story slot as a carousel: the server renders each lead card, this only fades between
 * them. Auto-advances every 6 s, pauses on hover/focus or when the tab is hidden, swipes on touch,
 * and never auto-plays for readers who prefer reduced motion.
 */
export function LeadSlider({ children, labels }: { children: ReactNode; labels: { prev: string; next: string; slide: string } }) {
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
      className="group/slider relative"
      role="region"
      aria-roledescription="carousel"
      aria-label={labels.slide}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') go(1)
        if (e.key === 'ArrowLeft') go(-1)
      }}
      onTouchStart={(e) => (touchX.current = e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return
        const dx = (e.changedTouches[0]?.clientX ?? 0) - touchX.current
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1)
        touchX.current = null
      }}
    >
      {/* All slides share one grid cell, so the slot keeps the height of the tallest card */}
      <div className="grid">
        {slides.map((slide, i) => (
          <div
            key={i}
            aria-hidden={i !== index}
            inert={i !== index}
            className={cn(
              'col-start-1 row-start-1 transition-[opacity,transform] duration-700 ease-out',
              i === index ? 'z-10 opacity-100 [&_img]:scale-[1.04] [&_img]:duration-[6000ms]' : 'pointer-events-none z-0 opacity-0',
            )}
          >
            {slide}
          </div>
        ))}
      </div>

      {/* Progress bars double as slide picker */}
      <div className="absolute inset-x-6 top-4 z-20 flex gap-1.5" role="tablist">
        {slides.map((_, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={`${labels.slide} ${i + 1}`}
            onClick={() => setIndex(i)}
            className="h-1 flex-1 overflow-hidden rounded-full bg-white/35 backdrop-blur"
          >
            <span
              key={`${index}-${paused}`}
              className={cn(
                'block h-full rounded-full bg-white',
                i < index && 'w-full',
                i > index && 'w-0',
                i === index && (paused || reduced ? 'w-full' : 'w-0 animate-[slider-progress_6s_linear_forwards]'),
              )}
            />
          </button>
        ))}
      </div>

      <button
        type="button"
        aria-label={labels.prev}
        onClick={() => go(-1)}
        className="absolute start-3 top-[28%] z-20 hidden h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white opacity-0 backdrop-blur transition hover:bg-black/60 group-hover/slider:opacity-100 md:flex"
      >
        <ChevronLeft className="h-5 w-5 rtl:rotate-180" aria-hidden />
      </button>
      <button
        type="button"
        aria-label={labels.next}
        onClick={() => go(1)}
        className="absolute end-3 top-[28%] z-20 hidden h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white opacity-0 backdrop-blur transition hover:bg-black/60 group-hover/slider:opacity-100 md:flex"
      >
        <ChevronRight className="h-5 w-5 rtl:rotate-180" aria-hidden />
      </button>
    </div>
  )
}
