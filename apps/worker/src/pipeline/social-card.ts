import { CATEGORIES, SITE } from '@zaviya/shared'
import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'

/** Open Graph (Facebook/X link preview) and Instagram portrait. */
export const SOCIAL_CARD_SIZES = {
  og: { width: 1200, height: 630 },
  portrait: { width: 1080, height: 1350 },
} as const

export type SocialCardFormat = keyof typeof SOCIAL_CARD_SIZES

export interface SocialCardRenderInput {
  title: string
  dek: string
  category: string
  categoryColor?: string
  locale: 'en' | 'ur'
  format: SocialCardFormat
}

export interface RenderedSocialCard {
  format: SocialCardFormat
  width: number
  height: number
  png: Buffer
}

const BRAND = {
  ink: '#0b0f17',
  inkMuted: '#1a2133',
  fg: '#ecedee',
  fgMuted: '#9aa3b2',
  accent: '#0e7c5a',
  breaking: '#d7263d',
  gold: '#b8902b',
  surface: '#121826',
} as const

const FONT_URLS = {
  inter400: 'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf',
  inter700: 'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf',
  urdu400:
    'https://fonts.gstatic.com/s/notonastaliqurdu/v23/LhWNMUPbN-oZdNFcBy1-DJYsEoTq5pudQ9L940pGPkB3Qt_-DK0.ttf',
  urdu700:
    'https://fonts.gstatic.com/s/notonastaliqurdu/v23/LhWNMUPbN-oZdNFcBy1-DJYsEoTq5pudQ9L940pGPkB3Qjj5DK0.ttf',
} as const

type SatoriElement = {
  type: string
  props: {
    style?: Record<string, string | number>
    children?: SatoriElement | string | (SatoriElement | string)[]
  }
}

let fontsPromise: Promise<
  { name: string; data: ArrayBuffer; weight: 400 | 700; style: 'normal' }[]
> | null = null

async function loadFonts(): Promise<
  { name: string; data: ArrayBuffer; weight: 400 | 700; style: 'normal' }[]
> {
  if (!fontsPromise) {
    fontsPromise = (async () => {
      const [inter400, inter700, urdu400, urdu700] = await Promise.all(
        [FONT_URLS.inter400, FONT_URLS.inter700, FONT_URLS.urdu400, FONT_URLS.urdu700].map(
          async (url) => {
            const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
            if (!res.ok) throw new Error(`Font fetch failed (${res.status}): ${url}`)
            return res.arrayBuffer()
          },
        ),
      )
      return [
        { name: 'Inter', data: inter400, weight: 400, style: 'normal' as const },
        { name: 'Inter', data: inter700, weight: 700, style: 'normal' as const },
        { name: 'Noto Nastaliq Urdu', data: urdu400, weight: 400, style: 'normal' as const },
        { name: 'Noto Nastaliq Urdu', data: urdu700, weight: 700, style: 'normal' as const },
      ]
    })()
  }
  return fontsPromise
}

export function truncateForCard(text: string, maxChars: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= maxChars) return t
  return `${t.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`
}

export function categoryAccentColor(categorySlug: string): string {
  const hit = CATEGORIES.find((c) => c.slug === categorySlug)
  return hit?.color ?? BRAND.accent
}

function el(
  type: string,
  style: Record<string, string | number>,
  ...children: (string | SatoriElement)[]
): SatoriElement {
  const flat = children.flat()
  return {
    type,
    props: {
      style,
      children: flat.length === 1 ? flat[0] : flat,
    },
  }
}

function buildCardTree(input: SocialCardRenderInput, size: (typeof SOCIAL_CARD_SIZES)[SocialCardFormat]): SatoriElement {
  const isUr = input.locale === 'ur'
  const dir = isUr ? 'rtl' : 'ltr'
  const titleFont = isUr ? 'Noto Nastaliq Urdu' : 'Inter'
  const bodyFont = isUr ? 'Noto Nastaliq Urdu' : 'Inter'
  const accent = input.categoryColor ?? categoryAccentColor(input.category)
  const titleSize = input.format === 'og' ? (isUr ? 52 : 48) : isUr ? 58 : 52
  const dekSize = input.format === 'og' ? 22 : 24
  const titleMax = input.format === 'og' ? 120 : 140
  const dekMax = input.format === 'og' ? 160 : 200
  const pad = input.format === 'og' ? 56 : 72
  const brandLabel = isUr ? SITE.nameUr : SITE.name
  const categoryLabel =
    CATEGORIES.find((c) => c.slug === input.category)?.[isUr ? 'ur' : 'en'] ?? input.category

  return el(
    'div',
    {
      width: size.width,
      height: size.height,
      display: 'flex',
      flexDirection: 'column',
      background: `linear-gradient(145deg, ${BRAND.ink} 0%, ${BRAND.inkMuted} 55%, ${BRAND.surface} 100%)`,
      color: BRAND.fg,
      fontFamily: bodyFont,
      position: 'relative',
    },
    el('div', {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 8,
      background: accent,
    }),
    el('div', {
      position: 'absolute',
      bottom: -120,
      right: -80,
      width: 420,
      height: 420,
      borderRadius: 9999,
      background: `${accent}22`,
    }),
    el(
      'div',
      {
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        padding: pad,
        paddingTop: pad + 16,
        direction: dir,
      },
      el(
        'div',
        {
          display: 'flex',
          flexDirection: isUr ? 'row-reverse' : 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 32,
        },
        el(
          'div',
          {
            display: 'flex',
            flexDirection: isUr ? 'row-reverse' : 'row',
            alignItems: 'center',
            gap: 16,
          },
          el(
            'div',
            {
              fontSize: 28,
              fontWeight: 700,
              fontFamily: titleFont,
              letterSpacing: isUr ? 0 : -0.5,
            },
            brandLabel,
          ),
          el(
            'div',
            {
              fontSize: 14,
              fontWeight: 700,
              fontFamily: bodyFont,
              color: BRAND.fg,
              background: `${accent}33`,
              border: `1px solid ${accent}`,
              paddingLeft: 14,
              paddingRight: 14,
              paddingTop: 6,
              paddingBottom: 6,
              borderRadius: 999,
              textTransform: 'uppercase',
            },
            categoryLabel,
          ),
        ),
        el(
          'div',
          {
            fontSize: 13,
            color: BRAND.fgMuted,
            fontFamily: 'Inter',
          },
          'zaviya.pk',
        ),
      ),
      el(
        'div',
        {
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: input.format === 'og' ? 20 : 28,
        },
        el(
          'div',
          {
            fontSize: titleSize,
            fontWeight: 700,
            fontFamily: titleFont,
            lineHeight: isUr ? 1.35 : 1.15,
            color: BRAND.fg,
            textAlign: isUr ? 'right' : 'left',
          },
          truncateForCard(input.title, titleMax),
        ),
        el(
          'div',
          {
            fontSize: dekSize,
            fontWeight: 400,
            fontFamily: bodyFont,
            lineHeight: 1.45,
            color: BRAND.fgMuted,
            textAlign: isUr ? 'right' : 'left',
          },
          truncateForCard(input.dek, dekMax),
        ),
      ),
      el(
        'div',
        {
          display: 'flex',
          flexDirection: isUr ? 'row-reverse' : 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 24,
          paddingTop: 20,
          borderTop: `1px solid ${BRAND.fgMuted}33`,
        },
        el(
          'div',
          {
            fontSize: 14,
            color: BRAND.gold,
            fontFamily: 'Inter',
          },
          isUr ? 'AI سے تیار کردہ گرافک' : 'AI-generated graphic',
        ),
        el(
          'div',
          {
            fontSize: 13,
            color: BRAND.fgMuted,
            fontFamily: 'Inter',
          },
          SITE.tagline,
        ),
      ),
    ),
  )
}

export async function renderSocialCard(input: SocialCardRenderInput): Promise<RenderedSocialCard> {
  const size = SOCIAL_CARD_SIZES[input.format]
  const fonts = await loadFonts()
  const tree = buildCardTree(input, size)
  const svg = await satori(tree as Parameters<typeof satori>[0], {
    width: size.width,
    height: size.height,
    fonts,
  })
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size.width },
  })
  const png = resvg.render().asPng()
  return {
    format: input.format,
    width: size.width,
    height: size.height,
    png: Buffer.from(png),
  }
}

export async function renderSocialCardSet(
  base: Omit<SocialCardRenderInput, 'format'>,
): Promise<{ og: Buffer; portrait: Buffer }> {
  const [og, portrait] = await Promise.all([
    renderSocialCard({ ...base, format: 'og' }),
    renderSocialCard({ ...base, format: 'portrait' }),
  ])
  return { og: og.png, portrait: portrait.png }
}
