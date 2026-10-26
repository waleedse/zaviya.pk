import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { SITE, type Locale } from '@zaviya/shared'
import { getArticleBySlug } from './queries'

/** 4:5 portrait: the size WhatsApp status, Facebook and Instagram feeds show without cropping (ZAV-223). */
export const SHARE_CARD_WIDTH = 1080
export const SHARE_CARD_HEIGHT = 1350

const FONT_URLS = {
  inter400: 'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf',
  inter700: 'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf',
  // One variable file covers both weights. Noto Naskh/Nastaliq cannot be read by the satori inside next/og (GSUB lookups).
  urdu400: 'https://fonts.gstatic.com/s/vazirmatn/v16/Dxx78j6PP2D_kU2muijPEe1n2vVbfJRklY80ORc.ttf',
  urdu700: 'https://fonts.gstatic.com/s/vazirmatn/v16/Dxx78j6PP2D_kU2muijPEe1n2vVbfJRklY80ORc.ttf',
} as const

type CardFont = { name: string; data: ArrayBuffer; weight: 400 | 700; style: 'normal' }
let fonts: Promise<CardFont[]> | null = null

function loadFonts(): Promise<CardFont[]> {
  if (!fonts) {
    fonts = Promise.all(
      (Object.entries(FONT_URLS) as [keyof typeof FONT_URLS, string][]).map(async ([key, url]): Promise<CardFont> => {
        const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
        if (!res.ok) throw new Error(`font fetch failed (${res.status}): ${key}`)
        return {
          name: key.startsWith('urdu') ? 'Vazirmatn' : 'Inter',
          data: await res.arrayBuffer(),
          weight: key.endsWith('700') ? 700 : 400,
          style: 'normal',
        }
      }),
    ).catch((e) => {
      fonts = null // try again on the next request
      throw e
    })
  }
  return fonts
}

let logo: Promise<string | null> | null = null
function loadLogo(): Promise<string | null> {
  logo ??= readFile(join(process.cwd(), 'public', 'logo.png'))
    .then((b) => `data:image/png;base64,${b.toString('base64')}`)
    .catch(() => null)
  return logo
}

/** Headline size that keeps long titles inside the card */
export function shareCardTitleSize(title: string, isUr: boolean): number {
  const n = title.length
  if (isUr) return n > 110 ? 54 : n > 70 ? 62 : 72
  return n > 110 ? 62 : n > 70 ? 72 : 86
}

export function shareCardTitle(title: string, max = 150): string {
  const t = title.replace(/\s+/g, ' ').trim()
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`
}

/**
 * The satori inside next/og lays words out left to right even for Urdu. Wrapping the text ourselves and reversing the word
 * order of every line gives a correct right-to-left card; each line is drawn as its own right-aligned row.
 */
export function rtlLines(text: string, maxChars: number): string[] {
  const lines: string[][] = [[]]
  let len = 0
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const cur = lines[lines.length - 1]
    if (cur.length && len + 1 + word.length > maxChars) {
      lines.push([word])
      len = word.length
    } else {
      cur.push(word)
      len += (cur.length > 1 ? 1 : 0) + word.length
    }
  }
  return lines.filter((l) => l.length).map((l) => l.reverse().join(' '))
}

export function shareCardDate(iso: string, locale: Locale): string {
  return new Date(iso).toLocaleDateString(locale === 'ur' ? 'ur-PK' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Karachi',
  })
}

/** GET /card/<slug>.png and /card/ur/<slug>.png: a headline card people can save and forward. */
export async function shareCardResponse(locale: Locale, file: string): Promise<Response> {
  const slug = decodeURIComponent(file).replace(/\.png$/i, '')
  if (!slug || slug.includes('/')) return new Response('not found', { status: 404 })
  const article = await getArticleBySlug(locale, slug)
  if (!article) return new Response('not found', { status: 404 })

  let loaded: CardFont[]
  try {
    loaded = await loadFonts()
  } catch {
    return new Response('card fonts unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
  const logoUrl = await loadLogo()
  const isUr = locale === 'ur'
  const font = isUr ? 'Vazirmatn' : 'Inter'
  const accent = article.category.color || '#0e7c5a'
  const brand = isUr ? SITE.nameUr : SITE.brandName
  const pad = 80
  const title = shareCardTitle(article.title)
  const titleSize = shareCardTitleSize(title, isUr)
  const rtl = (t: string) => rtlLines(t, 999)[0] ?? ''

  return new ImageResponse(
    (
      <div
        style={{
          width: SHARE_CARD_WIDTH,
          height: SHARE_CARD_HEIGHT,
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(160deg, #0b0f17 0%, #1a2133 60%, #121826 100%)',
          color: '#ecedee',
          fontFamily: font,
          position: 'relative',
        }}
      >
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 12, background: accent }} />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: pad, paddingTop: pad + 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: isUr ? 'flex-end' : 'flex-start' }}>
            <div
              style={{
                display: 'flex',
                fontSize: 28,
                fontWeight: 700,
                color: '#ffffff',
                background: `${accent}55`,
                border: `2px solid ${accent}`,
                padding: '8px 24px',
                borderRadius: 999,
              }}
            >
              {isUr ? rtl(article.category.name) : article.category.name}
            </div>
          </div>
          <div style={{ display: 'flex', flex: 1, alignItems: 'center' }}>
            {isUr ? (
              <div style={{ display: 'flex', flexDirection: 'column', width: '100%', alignItems: 'flex-end', fontSize: titleSize, fontWeight: 700, lineHeight: 1.55 }}>
                {rtlLines(title, Math.floor((SHARE_CARD_WIDTH - pad * 2) / (titleSize * 0.85))).map((line, i) => (
                  <div key={i} style={{ display: 'flex', width: '100%', justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
                    {line}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', width: '100%', fontSize: titleSize, fontWeight: 700, lineHeight: 1.12, letterSpacing: -1.5 }}>{title}</div>
            )}
          </div>
          <div style={{ display: 'flex', fontSize: 30, color: '#9aa3b2', fontFamily: font, justifyContent: isUr ? 'flex-end' : 'flex-start' }}>
            {isUr ? rtl(shareCardDate(article.publishedAt, locale)) : shareCardDate(article.publishedAt, locale)}
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: isUr ? 'row-reverse' : 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: `36px ${pad}px`,
            background: accent,
            color: '#ffffff',
          }}
        >
          <div style={{ display: 'flex', flexDirection: isUr ? 'row-reverse' : 'row', alignItems: 'center', gap: 20 }}>
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} width={84} height={84} alt="" style={{ borderRadius: 18 }} />
            )}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: isUr ? 'flex-end' : 'flex-start' }}>
              <div style={{ display: 'flex', fontSize: 38, fontWeight: 700 }}>{brand}</div>
              <div style={{ display: 'flex', fontSize: 26, fontWeight: 400 }}>{isUr ? rtl('مزید خبروں کے لیے فالو کریں') : 'Follow Zaviya News'}</div>
            </div>
          </div>
          <div style={{ display: 'flex', fontSize: 38, fontWeight: 700, fontFamily: 'Inter', direction: 'ltr' }}>zaviya.pk</div>
        </div>
      </div>
    ),
    {
      width: SHARE_CARD_WIDTH,
      height: SHARE_CARD_HEIGHT,
      fonts: loaded,
      headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800' },
    },
  )
}
