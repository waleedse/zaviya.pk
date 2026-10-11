'use client'

import { Pause, Play } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Locale } from '@zaviya/shared'
import { cn } from '@/lib/utils'

const SCALES = [0.92, 1, 1.1, 1.22]
const SCALE_KEY = 'zv-text-scale'

/** Listen (browser text-to-speech) and text size for the story in #article-body. */
export function ArticleToolbar({ locale, minutes }: { locale: Locale; minutes?: number }) {
  const isUr = locale === 'ur'
  const [scale, setScale] = useState(1)
  const [canSpeak, setCanSpeak] = useState(false)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    setCanSpeak(typeof window !== 'undefined' && 'speechSynthesis' in window)
    try {
      const saved = Number(localStorage.getItem(SCALE_KEY))
      if (SCALES.includes(saved)) setScale(SCALES.indexOf(saved))
    } catch {}
    return () => window.speechSynthesis?.cancel()
  }, [])

  useEffect(() => {
    const body = document.getElementById('article-body')
    if (body) body.style.setProperty('--article-scale', String(SCALES[scale]))
  }, [scale])

  const changeScale = (delta: number) => {
    const next = Math.max(0, Math.min(SCALES.length - 1, scale + delta))
    setScale(next)
    try {
      localStorage.setItem(SCALE_KEY, String(SCALES[next]))
    } catch {}
  }

  const toggleListen = () => {
    const synth = window.speechSynthesis
    if (playing) {
      synth.cancel()
      setPlaying(false)
      return
    }
    const text = [document.querySelector('h1')?.textContent, document.getElementById('article-body')?.innerText].filter(Boolean).join('. ')
    if (!text) return
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = isUr ? 'ur-PK' : 'en-GB'
    const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(isUr ? 'ur' : 'en'))
    if (voice) utter.voice = voice
    utter.rate = 1
    utter.onend = () => setPlaying(false)
    utter.onerror = () => setPlaying(false)
    synth.cancel()
    synth.speak(utter)
    setPlaying(true)
  }

  const btn = 'h-11 w-11 text-sm font-extrabold text-fg-muted hover:text-accent disabled:opacity-40'
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {canSpeak && (
        <button
          type="button"
          onClick={toggleListen}
          aria-pressed={playing}
          className={cn('inline-flex h-11 items-center gap-2.5 rounded-xl px-4 text-sm font-extrabold text-white transition-colors', playing ? 'bg-accent' : 'bg-ink hover:bg-ink-2 dark:bg-surface-2')}
        >
          {playing ? (
            <>
              <span className="flex h-3.5 items-end gap-[3px]" aria-hidden>
                <span className="h-full w-[3px] origin-bottom animate-pulse rounded-sm bg-white" />
                <span className="h-2/3 w-[3px] origin-bottom animate-pulse rounded-sm bg-white [animation-delay:150ms]" />
                <span className="h-full w-[3px] origin-bottom animate-pulse rounded-sm bg-white [animation-delay:300ms]" />
              </span>
              <Pause className="h-4 w-4" aria-hidden />
              {isUr ? 'روکیں' : 'Stop listening'}
            </>
          ) : (
            <>
              <Play className="h-4 w-4 fill-current" aria-hidden />
              {isUr ? 'سنیں' : 'Listen'}
              {minutes ? <span className="font-semibold opacity-75">· {minutes} {isUr ? 'منٹ' : 'min'}</span> : null}
            </>
          )}
        </button>
      )}
      <div className="inline-flex items-center rounded-xl border border-border bg-surface" role="group" aria-label={isUr ? 'متن کا سائز' : 'Text size'}>
        <button type="button" onClick={() => changeScale(-1)} disabled={scale === 0} className={btn} aria-label={isUr ? 'چھوٹا متن' : 'Smaller text'}>
          A−
        </button>
        <span className="h-5 w-px bg-border" aria-hidden />
        <button type="button" onClick={() => changeScale(1)} disabled={scale === SCALES.length - 1} className={cn(btn, 'text-lg')} aria-label={isUr ? 'بڑا متن' : 'Larger text'}>
          A+
        </button>
      </div>
    </div>
  )
}
