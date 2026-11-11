import { BRAND_YELLOW, MARK, escapeHtml, page, renderCardHtml } from './post-card.js'

/**
 * "Who said what" card (1080x1350): the speaker's real photo behind, the quote big in the language it was said in,
 * the name and role, the source line and the Zaviya brand.
 */
export interface QuoteCardInput {
  quote: string
  speaker: string
  role?: string
  /** "@handle on X" or the outlet's name */
  sourceLabel: string
  lang: 'en' | 'ur'
  /** data: URL of the speaker's photo */
  photo: string
  photoCredit?: string
  time?: string
}

/** Longer quotes step down so they never overflow the card. */
export function quoteSize(quote: string, lang: 'en' | 'ur'): number {
  const n = quote.length
  const steps = lang === 'ur' ? [62, 54, 46, 40] : [72, 62, 54, 46]
  return n <= 80 ? steps[0]! : n <= 140 ? steps[1]! : n <= 200 ? steps[2]! : steps[3]!
}

export function quoteCardHtml(input: QuoteCardInput): string {
  const y = BRAND_YELLOW
  const size = quoteSize(input.quote, input.lang)
  const ur = input.lang === 'ur'
  return page(
    `<img class="bg" src="${input.photo}" alt="" style="object-position:50% 25%">
<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.5) 0%,rgba(0,0,0,.05) 18%,rgba(6,8,12,.55) 38%,rgba(6,8,12,.94) 62%,rgba(6,8,12,.98) 100%)"></div>
<div style="position:absolute;top:52px;left:60px;right:60px;display:flex;justify-content:space-between;align-items:center">
  <div style="display:flex;align-items:center;gap:12px">${MARK('#fff', y)}<div style="font-weight:800;font-size:44px;letter-spacing:-1px;line-height:.9">zaviya</div></div>
  <div class="mono" style="font-size:20px;background:rgba(0,0,0,.45);padding:8px 16px;border-radius:6px">WHO SAID WHAT${input.time ? ` · ${escapeHtml(input.time)}` : ''}</div>
</div>
<div style="position:absolute;left:60px;right:60px;bottom:70px;display:flex;flex-direction:column;gap:28px">
  <div style="font-family:'Unbounded',sans-serif;font-size:150px;line-height:.6;color:${y};height:70px;${ur ? 'text-align:right' : ''}">&ldquo;</div>
  <div class="${ur ? 'ur' : 'en'}" style="font-size:${size}px;font-weight:${ur ? 700 : 800};line-height:${ur ? 1.9 : 1.18};letter-spacing:${ur ? 0 : '-0.02em'};text-align:${ur ? 'right' : 'left'};text-shadow:0 2px 24px rgba(0,0,0,.6)">${escapeHtml(input.quote)}</div>
  <div style="width:150px;height:6px;background:${y};${ur ? 'margin-left:auto' : ''}"></div>
  <div style="${ur ? 'text-align:right' : ''}">
    <div style="font-weight:900;font-size:56px;letter-spacing:-0.02em;line-height:1.05">${escapeHtml(input.speaker)}</div>
    ${input.role ? `<div style="font-weight:700;font-size:30px;color:${y};margin-top:6px">${escapeHtml(input.role)}</div>` : ''}
  </div>
  <div class="mono" style="font-size:22px;color:rgba(255,255,255,.78);${ur ? 'text-align:right' : ''}">SOURCE: ${escapeHtml(input.sourceLabel.toUpperCase())} · ZAVIYA.PK</div>
</div>
${input.photoCredit ? `<div style="position:absolute;right:24px;top:140px;writing-mode:vertical-rl;font-size:15px;color:rgba(255,255,255,.7)">${escapeHtml(input.photoCredit)}</div>` : ''}`,
  )
}

export async function renderQuoteCard(input: QuoteCardInput, executablePath: string | undefined): Promise<Buffer | null> {
  return renderCardHtml(quoteCardHtml(input), executablePath)
}
