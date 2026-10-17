import { loadFont } from '@remotion/fonts'
import React, { useEffect, useState } from 'react'
import { cancelRender, continueRender, delayRender } from 'remotion'
import inter700 from '@fontsource/inter/files/inter-latin-700-normal.woff2'
import inter800 from '@fontsource/inter/files/inter-latin-800-normal.woff2'
import inter900 from '@fontsource/inter/files/inter-latin-900-normal.woff2'
import inter900i from '@fontsource/inter/files/inter-latin-900-italic.woff2'
import unbounded900 from '@fontsource/unbounded/files/unbounded-latin-900-normal.woff2'
import mono700 from '@fontsource/space-mono/files/space-mono-latin-700-normal.woff2'
import nastaliqArabic from '@fontsource/noto-nastaliq-urdu/files/noto-nastaliq-urdu-arabic-700-normal.woff2'
import nastaliqLatin from '@fontsource/noto-nastaliq-urdu/files/noto-nastaliq-urdu-latin-700-normal.woff2'

export const FONT = {
  inter: "'Inter', 'Helvetica Neue', Arial, sans-serif",
  display: "'Unbounded', 'Inter', sans-serif",
  mono: "'Space Mono', ui-monospace, Menlo, monospace",
  urdu: "'Noto Nastaliq Urdu', 'Noto Nastaliq Urdu Latin', serif",
} as const

let promise: Promise<unknown> | null = null

/** Loads every font from bundled woff2 files: a render never touches Google Fonts. */
export function loadAllFonts(): Promise<unknown> {
  if (!promise) {
    promise = Promise.all([
      loadFont({ family: 'Inter', url: inter700, weight: '700', style: 'normal' }),
      loadFont({ family: 'Inter', url: inter800, weight: '800', style: 'normal' }),
      loadFont({ family: 'Inter', url: inter900, weight: '900', style: 'normal' }),
      loadFont({ family: 'Inter', url: inter900i, weight: '900', style: 'italic' }),
      loadFont({ family: 'Unbounded', url: unbounded900, weight: '900', style: 'normal' }),
      loadFont({ family: 'Space Mono', url: mono700, weight: '700', style: 'normal' }),
      loadFont({ family: 'Noto Nastaliq Urdu', url: nastaliqArabic, weight: '700', style: 'normal' }),
      loadFont({ family: 'Noto Nastaliq Urdu Latin', url: nastaliqLatin, weight: '700', style: 'normal' }),
    ]).then(async () => {
      await document.fonts.ready
    })
  }
  return promise
}

/** Renders nothing until every font is loaded, so text measuring is always done with the real fonts. */
export const FontGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ready, setReady] = useState(false)
  const [handle] = useState(() => delayRender('fonts'))
  useEffect(() => {
    loadAllFonts()
      .then(() => {
        setReady(true)
        continueRender(handle)
      })
      .catch((e) => cancelRender(e))
  }, [handle])
  return ready ? <>{children}</> : null
}
