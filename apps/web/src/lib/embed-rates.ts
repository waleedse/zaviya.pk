import type { RateTick } from '@zaviya/shared'

export const EMBED_TYPES = ['gold', 'dollar', 'petrol', 'all'] as const
export type EmbedType = (typeof EMBED_TYPES)[number]
export type EmbedTheme = 'light' | 'dark'

const SERIES: Record<Exclude<EmbedType, 'all'>, string[]> = {
  gold: ['gold_24k_tola'],
  dollar: ['usd_interbank', 'usd_open_sell'],
  petrol: ['petrol_super'],
}

const TITLES: Record<EmbedType, { text: string; href: string }> = {
  gold: { text: 'Gold rate today by Zaviya News', href: '/gold-rate-today-pakistan' },
  dollar: { text: 'Dollar rate today by Zaviya News', href: '/dollar-rate-today-pakistan' },
  petrol: { text: 'Petrol price today by Zaviya News', href: '/petrol-price-today-pakistan' },
  all: { text: 'Rates today by Zaviya News', href: '/gold-rate-today-pakistan' },
}

export function embedTitle(type: EmbedType) {
  return TITLES[type]
}

export function parseEmbedParams(search: URLSearchParams): { type: EmbedType; theme: EmbedTheme } {
  const type = EMBED_TYPES.find((t) => t === search.get('type')) ?? 'all'
  const theme: EmbedTheme = search.get('theme') === 'dark' ? 'dark' : 'light'
  return { type, theme }
}

export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const fmt = (n: number) => new Intl.NumberFormat('en-PK', { maximumFractionDigits: 2 }).format(n)

export function selectEmbedRates(ticks: RateTick[], type: EmbedType): RateTick[] {
  if (type === 'all') return ticks
  return ticks.filter((t) => SERIES[type].includes(t.series))
}

/** Self-contained rates card: inline CSS, no script, no cookies, no ad code, well under 15 KB. */
export function renderRatesEmbed(ticks: RateTick[], opts: { type: EmbedType; theme: EmbedTheme; origin: string }): string {
  const { type, theme, origin } = opts
  const rows = selectEmbedRates(ticks, type)
  const title = TITLES[type]
  const dark = theme === 'dark'
  const c = dark
    ? { bg: '#111827', fg: '#f9fafb', muted: '#9ca3af', line: '#374151', up: '#34d399', down: '#f87171', link: '#fbbf24' }
    : { bg: '#ffffff', fg: '#111827', muted: '#6b7280', line: '#e5e7eb', up: '#047857', down: '#b91c1c', link: '#b45309' }
  const updated = rows.map((r) => r.observedAt).sort().at(-1)
  const stamp = updated
    ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' }).format(new Date(updated)) + ' PKT'
    : ''
  const body = rows.length
    ? rows
        .map((r) => {
          const up = r.change >= 0
          const flat = r.change === 0
          const change = flat ? '' : `<span class="ch ${up ? 'up' : 'down'}">${up ? '&#9650;' : '&#9660;'} ${up ? '+' : ''}${fmt(r.change)}</span>`
          return `<li><span class="lb">${escapeHtml(r.label)}</span><span class="vl">${escapeHtml(fmt(r.value))} <small>${escapeHtml(r.unit)}</small>${change}</span></li>`
        })
        .join('')
    : '<li><span class="lb">Rates are being updated. Please check back soon.</span></li>'
  const href = `${origin}${title.href}?utm_source=embed&amp;utm_medium=widget`
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,follow"><title>${escapeHtml(title.text)}</title>
<style>
*{box-sizing:border-box}body{margin:0;background:${c.bg};color:${c.fg};font:14px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.w{padding:12px 14px}h1{margin:0 0 6px;font-size:15px;font-weight:700}ul{list-style:none;margin:0;padding:0}
li{display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-top:1px solid ${c.line}}
.lb{color:${c.muted}}.vl{font-weight:700;text-align:right}.vl small{font-weight:400;color:${c.muted}}
.ch{display:block;font-size:12px;font-weight:600}.up{color:${c.up}}.down{color:${c.down}}
.ft{display:flex;justify-content:space-between;gap:8px;margin-top:6px;padding-top:8px;border-top:1px solid ${c.line};font-size:12px;color:${c.muted}}
a{color:${c.link};font-weight:600;text-decoration:none}a:hover{text-decoration:underline}
</style></head><body><div class="w">
<h1><a href="${href}" target="_blank" rel="noopener">${escapeHtml(title.text)}</a></h1>
<ul>${body}</ul>
<div class="ft"><span>${escapeHtml(stamp)}</span><a href="${origin}/?utm_source=embed&amp;utm_medium=widget" target="_blank" rel="noopener">Powered by Zaviya News</a></div>
</div></body></html>`
}

/** The copy-paste snippet: the iframe plus a plain followed link outside it. */
export function embedSnippet(type: EmbedType, theme: EmbedTheme, origin: string): string {
  const height = type === 'all' ? 230 : type === 'dollar' ? 160 : 120
  const t = TITLES[type]
  return `<iframe src="${origin}/embed/rates?type=${type}&theme=${theme}" width="320" height="${height}" style="border:0;max-width:100%" loading="lazy" title="${t.text}"></iframe>\n<p><a href="${origin}${t.href}">${t.text}</a></p>`
}
