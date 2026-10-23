import type { Browser } from 'puppeteer-core'
import { CATEGORIES } from '@zaviya/shared'
import { logger } from '../logger.js'

/**
 * Social post cards (1080x1350): the story's hero photo full-bleed, the headline in English and Urdu on top.
 * Rendered in headless Chromium because Satori cannot shape Nastaliq. One look for every story (breaking adds a red tag,
 * a number from the writer becomes the boxed word); the template names stay for callers that still pick one.
 */
export type PostCardTemplate = 'bilingual' | 'figure' | 'ticker'

export interface PostCardInput {
  title: string
  category: string
  photo: string | null
  /** Shown small on the card when the photo needs attribution */
  photoCredit?: string
  breaking?: boolean
  headlineUr?: string | null
  highlight?: string | null
  highlightUr?: string | null
  figure?: { value: string; label: string } | null
  /** e.g. "14:32 PKT" */
  time?: string
}

export const POST_CARD_SIZE = { width: 1080, height: 1350 } as const
export const BRAND_YELLOW = '#FFC93C'

export function chooseTemplate(input: Pick<PostCardInput, 'breaking' | 'figure'>): PostCardTemplate {
  if (input.breaking) return 'ticker'
  if (input.figure?.value) return 'figure'
  return 'bilingual'
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** Escapes the text and wraps the first match of `highlight` (case-insensitive) in a span. */
export function markHighlight(text: string, highlight: string | null | undefined, cls = 'hl'): string {
  const safe = escapeHtml(text)
  const h = highlight?.trim()
  if (!h) return safe
  const i = text.toLowerCase().indexOf(h.toLowerCase())
  if (i < 0) return safe
  return `${escapeHtml(text.slice(0, i))}<span class="${cls}">${escapeHtml(text.slice(i, i + h.length))}</span>${escapeHtml(text.slice(i + h.length))}`
}

/** Large and elegant, but never overflowing: longer headlines step down. */
export function headlineSize(title: string, template: PostCardTemplate): number {
  const n = title.length
  const steps = template === 'ticker' ? [104, 92, 80, 70] : template === 'figure' ? [84, 76, 68, 60] : [92, 84, 74, 64]
  return n <= 45 ? steps[0]! : n <= 65 ? steps[1]! : n <= 85 ? steps[2]! : steps[3]!
}

const FONTS =
  'https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,700;0,800;0,900;1,800;1,900&family=Noto+Nastaliq+Urdu:wght@700&family=Unbounded:wght@900&family=Space+Mono:wght@700&display=block'

const MARK = (stroke: string, arc: string) =>
  `<svg viewBox="0 0 46 40" width="44" height="38" aria-hidden="true"><path d="M3 37 L43 37 M3 37 L33 5" stroke="${stroke}" stroke-width="4.5" fill="none"/><path d="M19 37 A16 16 0 0 0 14 25" stroke="${arc}" stroke-width="4.5" fill="none"/></svg>`

function page(body: string, extraCss = ''): string {
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${FONTS}"><style>
*{box-sizing:border-box}body{margin:0}
.card{width:1080px;height:1350px;position:relative;overflow:hidden;background:#111;color:#fff;font-family:'Inter',sans-serif}
.bg{position:absolute;inset:0;width:1080px;height:1350px;object-fit:cover}
.mono{font-family:'Space Mono',monospace;font-weight:700;letter-spacing:2px}
.ur{font-family:'Noto Nastaliq Urdu',serif;font-weight:700;direction:rtl;text-align:right;text-wrap:balance}
.en{font-weight:900;letter-spacing:-0.035em;line-height:1;text-wrap:balance}
${extraCss}</style></head><body><div class="card">${body}</div></body></html>`
}

function categoryLabel(slug: string): string {
  return CATEGORIES.find((c) => c.slug === slug)?.en ?? slug
}

export function postCardHtml(input: PostCardInput, _template = chooseTemplate(input)): string {
  const photo = input.photo ? `<img class="bg" src="${input.photo}" alt="">` : ''
  const time = escapeHtml(input.time ?? '')
  const cat = escapeHtml(categoryLabel(input.category).toUpperCase())
  // One look for every story (22 Oct: the NUMBERS and ticker looks were still going out and read as the old design)
  const size = headlineSize(input.title, 'bilingual')
  const figure = input.figure?.value && input.title.toLowerCase().includes(input.figure.value.toLowerCase()) ? input.figure.value : null
  const highlight = input.highlight || figure

  // bilingual: the feed look that works for news pages: photo, logo top-left, centred bold headline, key words boxed
  const y = BRAND_YELLOW
  return page(
    `${photo}
<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.45) 0%,rgba(0,0,0,0) 20%,rgba(0,0,0,0) 38%,rgba(6,8,12,.78) 62%,rgba(6,8,12,.97) 100%)"></div>
<div style="position:absolute;top:52px;left:60px;right:60px;display:flex;justify-content:space-between;align-items:center">
  <div style="display:flex;align-items:flex-end;gap:12px">${MARK('#fff', y)}<div style="font-weight:800;font-size:44px;letter-spacing:-1px;line-height:.9">zaviya</div></div>
  <div class="mono" style="font-size:20px;background:rgba(0,0,0,.45);padding:8px 16px;border-radius:6px">${cat}${time ? ` · ${time}` : ''}</div>
</div>
${input.breaking ? `<div class="mono" style="position:absolute;top:140px;left:60px;display:flex;align-items:center;gap:12px;font-size:26px;background:#E5231B;padding:10px 20px;border-radius:6px"><div style="width:16px;height:16px;border-radius:16px;background:#fff"></div>BREAKING</div>` : ''}
<div style="position:absolute;left:56px;right:56px;bottom:64px;display:flex;flex-direction:column;align-items:center;gap:30px;text-align:center">
  <div class="en" style="font-size:${size}px;font-weight:800;line-height:1.14;letter-spacing:-0.025em;text-shadow:0 2px 24px rgba(0,0,0,.55)">${markHighlight(input.title, highlight)}</div>
  <div style="width:150px;height:6px;background:${y}"></div>
  ${input.headlineUr ? `<div class="ur" style="font-size:50px;line-height:1.8;text-align:center;color:rgba(255,255,255,.95)">${markHighlight(input.headlineUr, input.highlightUr, 'hl-ur')}</div>` : ''}
  <div class="mono" style="font-size:20px;color:rgba(255,255,255,.75)">POORI KHABAR → ZAVIYA.PK</div>
</div>
${input.photoCredit ? `<div style="position:absolute;right:24px;top:620px;writing-mode:vertical-rl;font-size:15px;color:rgba(255,255,255,.7)">${escapeHtml(input.photoCredit)}</div>` : ''}`,
    `.hl{background:${y};color:#111;padding:0 .18em;margin:0 -.04em;border-radius:6px;font-style:normal;-webkit-box-decoration-break:clone;box-decoration-break:clone}.hl-ur{color:${y}}`,
  )
}

let browserPromise: Promise<Browser> | null = null

async function browser(executablePath: string): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = import('puppeteer-core').then(({ default: puppeteer }) =>
      puppeteer.launch({
        executablePath,
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--font-render-hinting=none'],
      }),
    )
    browserPromise.then((b) => b.on('disconnected', () => (browserPromise = null))).catch(() => (browserPromise = null))
  }
  return browserPromise
}

/** Renders the card to PNG; null when Chromium is not available or the render fails. */
export async function renderPostCard(input: PostCardInput, executablePath: string | undefined): Promise<Buffer | null> {
  if (!executablePath) return null
  const b = await browser(executablePath).catch((e) => {
    logger.warn({ err: e instanceof Error ? e.message : e }, 'post card: chromium did not start')
    return null
  })
  if (!b) return null
  const p = await b.newPage()
  try {
    await p.setViewport({ ...POST_CARD_SIZE, deviceScaleFactor: 1 })
    await p.setContent(postCardHtml(input), { waitUntil: 'load', timeout: 30_000 })
    await p.evaluate(async () => {
      await document.fonts.ready
    })
    return Buffer.from(await p.screenshot({ type: 'png', clip: { x: 0, y: 0, ...POST_CARD_SIZE } }))
  } catch (e) {
    logger.warn({ err: e instanceof Error ? e.message : e }, 'post card render failed')
    return null
  } finally {
    await p.close().catch(() => {})
  }
}
