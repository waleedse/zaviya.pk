import { logger } from '../logger.js'
import { licenceOk, type PhotoMeta, type RealPhoto } from './real-photo.js'

/**
 * Step (b) of the hero order: a real photo of the story's TOPIC (police, wheat, the stock exchange, a city) from Openverse,
 * which indexes Flickr and Wikimedia Commons. Only licences that allow commercial reuse WITHOUT restrictions on edits are
 * accepted (CC0, public domain, CC BY, CC BY-SA); NC and ND are never used (we crop and recompress every hero). The creator,
 * licence and landing page are kept so the credit can be shown. Never Google Images, never news sites.
 */
const API = 'https://api.openverse.org/v1/images/'
const UA = { 'user-agent': 'ZaviyaBot/1.0 (https://zaviya.pk; ops@zaviya.pk)' }

/** Hero images are shown 16:9 and cropped from the middle. 1200 px is preferred (Discover); Flickr serves 1024 px, so that is the floor. */
export const OV_PREFERRED_WIDTH = 1200
export const OV_MIN_WIDTH = 1000
export const OV_MIN_ASPECT = 1.15

export interface OpenverseResult {
  id?: string
  title?: string | null
  creator?: string | null
  url?: string
  foreign_landing_url?: string
  license?: string
  license_version?: string | null
  provider?: string | null
  source?: string | null
  category?: string | null
  tags?: { name?: string }[] | null
  width?: number | null
  height?: number | null
  mature?: boolean
}

/** A search the story maps to: `must` has to appear in the result's title or tags (Openverse search is fuzzy). */
export interface TopicQuery {
  q: string
  must: RegExp
  /** A common noun ("police"): the photo must say it is from Pakistan, or it could be anywhere */
  common: boolean
}

const PK_CONTEXT = /pakistan|karachi|lahore|islamabad|rawalpindi|peshawar|quetta|multan|faisalabad|sialkot|gujranwala|hyderabad|sindh|punjab|khyber|balochistan|gilgit|hunza|swat|kashmir|gwadar|kohat|abbottabad|murree|bahawalpur|sukkur|larkana|mardan|jhelum|torkham|karakoram/i

const TOPICS: { when: RegExp; query: string; must: RegExp; /** Only when no other topic fits ("prices" is in every economy headline) */ generic?: boolean }[] = [
  { when: /stock exchange|\bpsx\b|kse-?100|\bkse\b|benchmark index|bourse|equities/i, query: 'Pakistan Stock Exchange', must: /stock exchange|psx|bourse|karachi stock/i },
  { when: /police|policemen|\bdsp\b|\bsho\b|constable|\bssp\b|\bigp\b|counter-?terrorism|\bctd\b|levies|rangers/i, query: 'Pakistan police', must: /police|policeman|policemen|constable/i },
  { when: /wheat|flour|\batta\b|harvest/i, query: 'wheat harvest Pakistan', must: /wheat|harvest|crop|field/i },
  { when: /\brice\b|basmati/i, query: 'rice field Pakistan', must: /\brice\b|paddy/i },
  { when: /sugar|sugarcane|cane crushing/i, query: 'sugarcane Pakistan', must: /sugar|cane/i },
  { when: /cotton|textile|apparel|garment/i, query: 'cotton Pakistan', must: /cotton|textile|garment|loom|weav/i },
  { when: /farmer|agricultur|\bcrops?\b|fertili[sz]er|irrigation/i, query: 'farmers Pakistan fields', must: /farm|field|crop|agricultur|irrigat/i },
  { when: /school|students?|teachers?|\bexam|matric|education|universit|college|\bhec\b/i, query: 'Pakistan school students', must: /school|student|classroom|universit|college|pupil/i },
  { when: /flood|monsoon|heavy rain|rainfall|downpour|cloudburst/i, query: 'Pakistan flood', must: /flood|rain|monsoon/i },
  { when: /weather|\brain|storm|\bfog|heatwave|heat wave|snowfall|\bsnow\b|cold wave|\bpmd\b/i, query: 'Pakistan weather', must: /weather|rain|storm|fog|snow|cloud|heat|monsoon|sky/i },
  { when: /petrol|diesel|fuel|\boil\b|\bogra\b|\bpso\b|\blpg\b/i, query: 'petrol pump Pakistan', must: /petrol|pump|fuel|gas station|filling|diesel|\bpso\b/i },
  { when: /cricket|\bpcb\b|\bodi\b|\bt20\b|test match|\bpsl\b|batter|bowler|wicket/i, query: 'Pakistan cricket', must: /cricket|stadium|batsman|bowler|\bpcb\b/i },
  { when: /\barmy\b|\bispr\b|military|soldiers?|armed forces/i, query: 'Pakistan Army soldiers', must: /army|soldier|military|armed forces/i },
  { when: /airport|flights?\b|airline|\bpia\b|aircraft/i, query: 'Pakistan International Airlines aircraft', must: /airport|aircraft|airline|\bpia\b|airbus|boeing|plane|runway/i },
  { when: /hospital|dengue|polio|hepatitis|patients?|doctors?|health ministry|vaccin/i, query: 'Pakistan hospital', must: /hospital|clinic|doctor|patient|nurse|medical|vaccin|health/i },
  { when: /rupee|\busd\b|dollar|currency|inflation|\bcpi\b|\bsbp\b|state bank|interest rate|policy rate|forex|reserves/i, query: 'State Bank of Pakistan', must: /state bank|rupee|banknote|currency|bank/i },
  { when: /\bgold\b|bullion|\btola\b/i, query: 'gold jewellery Pakistan', must: /gold|jewel|bullion/i },
  { when: /electricity|power tariff|\bnepra\b|load-?shedding|\bwapda\b|\bk-?electric\b|\bdiscos?\b|circular debt|\blesco\b/i, query: 'Pakistan electricity transmission', must: /electric|power|pylon|transmission|grid|transformer|wapda|lesco/i },
  { when: /solar/i, query: 'solar panels Pakistan', must: /solar/i },
  { when: /railway|\btrains?\b|locomotive/i, query: 'Pakistan Railways train', must: /railway|train|locomotive|station/i },
  { when: /motorway|highway|\broads?\b|traffic|\btoll\b|\bnha\b/i, query: 'Pakistan motorway', must: /motorway|highway|road|traffic|bridge/i },
  { when: /supreme court|high court|\bcourt\b|judge|verdict|judicial/i, query: 'Supreme Court of Pakistan', must: /court|judic|justice|law/i },
  { when: /parliament|national assembly|senate|lawmakers|legislat/i, query: 'Parliament House Islamabad', must: /parliament|assembly|senate|islamabad/i },
  { when: /election|polling|ballot|voters?|\becp\b/i, query: 'Pakistan election polling station', must: /election|poll|ballot|vot/i },
  { when: /border|torkham|chaman|afghan|taliban/i, query: 'Torkham border Pakistan', must: /border|torkham|chaman|afghan|khyber|gate/i },
  { when: /internet|telecom|\bpta\b|\b5g\b|smartphone/i, query: 'Pakistan mobile phone', must: /mobile|phone|telecom|internet|tower/i },
  { when: /natural gas|\blng\b|\bsngpl\b|\bssgc\b|pipeline|gas supply|gas price/i, query: 'natural gas Pakistan', must: /gas|pipeline|lng|cylinder/i },
  { when: /\bbus\b|metro|transport|rickshaw|\bcng\b/i, query: 'Pakistan bus', must: /bus|metro|transport|rickshaw/i },
  { when: /\bfire\b|blaze|rescue|\b1122\b|building collapse|earthquake|landslide/i, query: 'Rescue 1122 Pakistan', must: /rescue|fire|ambulance|firefight|earthquake|landslide/i },
  { when: /protest|rally|\bmarch\b|sit-?in|strike/i, query: 'Pakistan protest rally', must: /protest|rally|march|demonstrat/i },
  { when: /\bprices?\b|market|bazaar|vendors?|vegetables?|tomato|onion|grocer/i, query: 'Pakistan bazaar market', must: /bazaar|market|vendor|shop|vegetable|stall/i, generic: true },
]

const CITIES = [
  'Karachi', 'Lahore', 'Islamabad', 'Rawalpindi', 'Peshawar', 'Quetta', 'Multan', 'Faisalabad', 'Sialkot', 'Gujranwala', 'Hyderabad', 'Sukkur', 'Larkana',
  'Bahawalpur', 'Mardan', 'Abbottabad', 'Swat', 'Gwadar', 'Kohat', 'Murree', 'Gilgit', 'Hunza', 'Skardu', 'Muzaffarabad', 'Mirpur', 'Bannu', 'Chitral', 'Jhelum', 'Sargodha',
]

const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'over', 'after', 'into', 'amid', 'says', 'say', 'said', 'new', 'will', 'has', 'have', 'its', 'their', 'than', 'more', 'about', 'pakistan', 'pakistani', 'govt', 'government', 'minister', 'killed', 'dead', 'injured', 'including', 'against', 'during', 'today', 'news', 'latest'])

/** Search queries for a story, best first (topic photos with Pakistani context, then the place the story names). */
export function topicQueries(input: { title: string; dek?: string; tags?: string[] }, max = 4): TopicQuery[] {
  const head = input.title
  const all = `${input.title} ${input.dek ?? ''}`
  const out: TopicQuery[] = []
  const add = (t: TopicQuery) => {
    if (!out.some((o) => o.q.toLowerCase() === t.q.toLowerCase())) out.push(t)
  }
  for (const t of TOPICS) if (!t.generic && t.when.test(head)) add({ q: t.query, must: t.must, common: true })
  for (const c of CITIES) if (new RegExp(`\\b${c}\\b`, 'i').test(head)) add({ q: c, must: new RegExp(c, 'i'), common: false })
  if (out.length < 2) for (const t of TOPICS) if (!t.generic && t.when.test(all)) add({ q: t.query, must: t.must, common: true })
  if (!out.length) for (const t of TOPICS) if (t.generic && t.when.test(head)) add({ q: t.query, must: t.must, common: true })
  if (!out.length) {
    // Nothing recognised: the story's own keywords, with Pakistan for context
    const words = (input.tags ?? []).filter((t) => t.length >= 4 && !/\s/.test(t.trim()) && !STOP.has(t.toLowerCase())).slice(0, 2)
    for (const w of words) add({ q: `${w} Pakistan`, must: new RegExp(w.replace(/[^a-z0-9]/gi, ''), 'i'), common: true })
  }
  return out.slice(0, max)
}

/** Licence short names for the credit */
export function licenceLabel(r: Pick<OpenverseResult, 'license' | 'license_version'>): string {
  const l = (r.license ?? '').toLowerCase()
  const v = (r.license_version ?? '').trim()
  if (l === 'cc0') return `CC0 ${v || '1.0'}`
  if (l === 'pdm') return `Public Domain Mark ${v || '1.0'}`
  if (l === 'by') return `CC BY${v ? ` ${v}` : ''}`
  if (l === 'by-sa') return `CC BY-SA${v ? ` ${v}` : ''}`
  return ''
}

/** The licence allows commercial reuse AND edits: CC0, public domain, CC BY, CC BY-SA. Everything else (NC, ND, unknown) is out. */
export function openverseLicenceOk(r: Pick<OpenverseResult, 'license' | 'license_version'>): boolean {
  const l = (r.license ?? '').toLowerCase()
  if (!['cc0', 'pdm', 'by', 'by-sa'].includes(l)) return false
  return licenceOk(licenceLabel(r))
}

const NOT_A_PHOTO = /logo|flag|\bmap\b|seal|chart|diagram|emblem|icon|signature|poster|stamp|banner|cartoon|caricature|painting|drawing|illustration|infographic|svg|vector|clipart|screenshot|\.pdf/i

const SOURCE_LABEL: Record<string, string> = { flickr: 'Flickr', wikimedia: 'Wikimedia Commons', wikimedia_commons: 'Wikimedia Commons', geographorg: 'Geograph', stocksnap: 'StockSnap' }
const SOURCE_RANK: Record<string, number> = { wikimedia: 3, wikimedia_commons: 3, flickr: 2 }

function sourceOf(r: OpenverseResult): string {
  return (r.source ?? r.provider ?? '').toLowerCase()
}

/** Checks a result against everything but the image bytes: licence, size, shape, file type, relevance, Pakistani context. */
export function openverseCandidateOk(r: OpenverseResult, t: TopicQuery): { ok: true } | { ok: false; reason: string } {
  if (!r.url || !/^https:\/\//.test(r.url)) return { ok: false, reason: 'no https image url' }
  if (!r.foreign_landing_url || !/^https:\/\//.test(r.foreign_landing_url)) return { ok: false, reason: 'no landing page to credit' }
  if (!openverseLicenceOk(r)) return { ok: false, reason: `licence ${r.license ?? 'unknown'} not allowed` }
  if (r.mature) return { ok: false, reason: 'mature content' }
  if (!/\.(jpe?g|png)(\?|$)/i.test(r.url)) return { ok: false, reason: 'not a jpeg/png' }
  const w = r.width ?? 0
  const h = r.height ?? 0
  if (w < OV_MIN_WIDTH) return { ok: false, reason: `too narrow (${w}px)` }
  if (w < h * OV_MIN_ASPECT) return { ok: false, reason: `not landscape (${w}x${h})` }
  const text = `${r.title ?? ''} ${(r.tags ?? []).map((x) => x.name ?? '').join(' ')}`
  if (NOT_A_PHOTO.test(`${r.title ?? ''} ${r.url}`)) return { ok: false, reason: 'not a photo by its title' }
  if (r.category && /illustration|digitized_artwork/i.test(r.category)) return { ok: false, reason: `category ${r.category}` }
  if (!t.must.test(text)) return { ok: false, reason: 'title and tags do not match the topic' }
  if (t.common && !PK_CONTEXT.test(`${text} ${r.url}`)) return { ok: false, reason: 'common topic, photo not from Pakistan' }
  return { ok: true }
}

/** Better first: Commons and Flickr, 1200 px and up, landscape, CC0/PD/CC BY before CC BY-SA, search order as the tie-break. */
export function rankCandidates<T extends { r: OpenverseResult; rank: number }>(rs: T[]): T[] {
  const score = (x: T) =>
    (SOURCE_RANK[sourceOf(x.r)] ?? 0) * 2 + ((x.r.width ?? 0) >= OV_PREFERRED_WIDTH ? 4 : 0) + ((x.r.width ?? 0) >= (x.r.height ?? 1) * 1.4 ? 1 : 0) + (x.r.license === 'by-sa' ? 0 : 1) - x.rank * 0.05
  return [...rs].sort((a, b) => score(b) - score(a))
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Openverse answers 504 now and then: a couple of quick retries, then give up (the next topic or the branded card follows). */
async function searchOpenverse(q: string, fetchFn: typeof fetch, retries = 3, pauseMs = 1500): Promise<OpenverseResult[]> {
  const url = `${API}?${new URLSearchParams({ q, license: 'cc0,pdm,by,by-sa', mature: 'false', page_size: '20' })}`
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetchFn(url, { headers: UA, signal: AbortSignal.timeout(20_000) })
      if (res.ok) return ((await res.json()) as { results?: OpenverseResult[] }).results ?? []
      logger.debug({ q, status: res.status, attempt: i + 1 }, 'openverse search failed')
    } catch (e) {
      logger.debug({ q, err: e instanceof Error ? e.message : e }, 'openverse search error')
    }
    if (i < retries - 1) await sleep(pauseMs * (i + 1))
  }
  return []
}

export function buildOpenverseMeta(topic: string, r: OpenverseResult): PhotoMeta {
  const src = sourceOf(r)
  const author = (r.creator ?? '').replace(/\s+/g, ' ').trim().slice(0, 70)
  const licence = licenceLabel(r)
  const creditLine = ['Photo:', [author, licence, SOURCE_LABEL[src] ?? r.source ?? 'Openverse'].filter(Boolean).join(' / ')].join(' ')
  const sourceUrl = r.foreign_landing_url ?? ''
  return {
    subject: topic,
    file: (r.title ?? r.id ?? '').trim(),
    author,
    licence,
    creditLine,
    sourceUrl,
    width: r.width ?? undefined,
    height: r.height ?? undefined,
    mediaCredit: `${creditLine} | ${sourceUrl}`,
    provider: 'openverse',
    fromCommons: src.startsWith('wikimedia'),
  }
}

export interface OpenverseOpts {
  fetchFn?: typeof fetch
  /** Extra check on a downloaded candidate (document/screenshot QA); the search moves on to the next one when it says no */
  accept?: (photo: RealPhoto) => boolean
  /** Candidates tried per query */
  tries?: number
  /** Pause between search retries (tests use 0) */
  pauseMs?: number
}

/** A real topic photo for a story, or null: each query in turn, best candidate first, the first that downloads and passes wins. */
export async function findOpenversePhoto(input: { title: string; dek?: string; tags?: string[] }, opts: OpenverseOpts = {}): Promise<RealPhoto | null> {
  const fetchFn = opts.fetchFn ?? fetch
  for (const t of topicQueries(input)) {
    const results = await searchOpenverse(t.q, fetchFn, 3, opts.pauseMs)
    const checked = results.map((r, rank) => ({ r, rank, v: openverseCandidateOk(r, t) }))
    for (const x of checked) if (!x.v.ok) logger.debug({ q: t.q, title: x.r.title, reason: x.v.reason }, 'openverse candidate skipped')
    const good = rankCandidates(checked.filter((c) => c.v.ok))
    for (const { r } of good.slice(0, opts.tries ?? 4)) {
      try {
        const img = await fetchFn(r.url!, { headers: UA, signal: AbortSignal.timeout(30_000) })
        const type = (img.headers.get('content-type') ?? '').split(';')[0] ?? ''
        if (!img.ok || !/^image\/(jpeg|png)$/.test(type)) continue
        const bytes = Buffer.from(await img.arrayBuffer())
        if (bytes.length > 12_000_000 || bytes.length < 20_000) continue
        const meta = buildOpenverseMeta(t.q, r)
        const photo: RealPhoto = { dataUrl: `data:${type};base64,${bytes.toString('base64')}`, credit: meta.creditLine, bytes, mime: type, meta }
        if (opts.accept && !opts.accept(photo)) continue
        logger.info({ query: t.q, title: r.title, licence: meta.licence, source: sourceOf(r) }, 'openverse photo found')
        return photo
      } catch (e) {
        logger.debug({ q: t.q, err: e instanceof Error ? e.message : e }, 'openverse download failed')
      }
    }
  }
  return null
}
