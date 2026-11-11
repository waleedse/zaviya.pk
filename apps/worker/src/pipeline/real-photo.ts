import { logger } from '../logger.js'
import { topicSubjects } from './photo-topics.js'

/**
 * A real photo of the person, place or thing a story is about: for article heroes and social cards.
 * Source: free-licence files on Wikimedia Commons (found through Wikipedia lead images, then a Commons file search).
 * Only licences that allow reuse with attribution are accepted (public domain, CC0, CC BY, CC BY-SA); the author,
 * licence and file page are kept so the credit can be shown. Never photos from news outlets or agencies (copyright).
 */
export interface PhotoMeta {
  subject: string
  file: string
  author: string
  licence: string
  /** What readers see: "Photo: Author / CC BY-SA 4.0 / Wikimedia Commons" */
  creditLine: string
  /** Commons file page */
  sourceUrl: string
  /** Size of the Commons original (the downloaded copy may be scaled down): the QA gate checks size and shape */
  width?: number
  height?: number
  /** creditLine plus the file page, as stored in Media.credit (`creditParts` in the web app splits it again) */
  mediaCredit: string
  /** Where the photo came from: Wikimedia Commons (default) or an Openverse topic photo (Flickr, Commons, ...) */
  provider?: 'commons' | 'openverse'
  /** Openverse photo that is itself a Commons file (media.license 'wikimedia' instead of 'stock') */
  fromCommons?: boolean
}

export interface RealPhoto {
  dataUrl: string
  credit: string
  bytes: Buffer
  mime: string
  meta: PhotoMeta
}

export interface PhotoOpts {
  /** Minimum width in px (default 900) */
  minWidth?: number
  /** Minimum width/height: heroes are shown 16:9 and cropped from the middle, so they need a landscape-ish photo */
  minAspect?: number
}

const API = 'https://en.wikipedia.org/w/api.php'
const UA = { 'user-agent': 'ZaviyaBot/1.0 (https://zaviya.pk; ops@zaviya.pk)' }
const SOCIAL: Required<PhotoOpts> = { minWidth: 900, minAspect: 0.7 }
const HERO: Required<PhotoOpts> = { minWidth: 1000, minAspect: 1.0 }

const GENERIC_FIRST = new Set(['state', 'prime', 'supreme', 'federal', 'national', 'pakistan', 'islamabad', 'punjab', 'sindh', 'chief', 'finance', 'foreign', 'central', 'general', 'united', 'world', 'north', 'south', 'east', 'west', 'high', 'court'])

/** Family names that many people share: "Sharif" or "Khan" in a headline does not say which one. */
const AMBIGUOUS_SURNAME = new Set(['khan', 'sharif', 'shah', 'ahmed', 'ahmad', 'ali', 'hussain', 'hasan', 'butt', 'malik', 'bhutto', 'zardari', 'singh', 'kumar', 'smith', 'jones', 'brown', 'johnson', 'junior', 'senior', 'mohammad', 'muhammad'])

const wordRe = (w: string) => new RegExp(`(^|[^a-z])${w.replace(/[^a-z]/g, '')}([^a-z]|$)`)

/**
 * Does the text name this entity? The full tag, or for a person-style tag of 2-3 words ("Donald Trump", "Shehbaz Sharif")
 * its given name ("PM Shehbaz ...") or its surname ("Trump warns ...") as a word. Short, generic or shared names do not count.
 */
/** Lower-case and drop accents, so a "Kraków" or "Erdoğan" tag matches a "Krakow" or "Erdogan" headline. */
const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export function namedIn(title: string, tag: string): boolean {
  const t = fold(title)
  const full = fold(tag.trim())
  if (full.length >= 3 && t.includes(full)) return true
  const words = full.split(/\s+/)
  if (words.length < 2 || words.length > 3) return false
  const first = words[0] ?? ''
  if (first.length >= 5 && !GENERIC_FIRST.has(first) && wordRe(first).test(t)) return true
  const last = (words[words.length - 1] ?? '').replace(/[^a-z]/g, '')
  return last.length >= 4 && !GENERIC_FIRST.has(last) && !AMBIGUOUS_SURNAME.has(last) && wordRe(last).test(t)
}

/** Tags the headline names, longest (most specific) first. */
export function subjectsFor(title: string, tags: string[], max = 3): string[] {
  return tags
    .map((x) => x.trim())
    .filter((x) => x.length >= 3 && namedIn(title, x))
    .sort((a, b) => b.length - a.length)
    .slice(0, max)
}

/**
 * Subjects for an article hero, best first: named people/organisations/places of two or more words, then the topic
 * fallbacks (US Congress -> the Capitol), then single-word entities the headline names. Entities that only the dek or
 * the image brief name are tried last, so a hero never shows a face the story is not about.
 */
export function heroSubjects(input: { title: string; dek?: string; brief?: string; tags: string[] }, max = 5): string[] {
  const body = [input.dek, input.brief].filter(Boolean).join(' ')
  const all = `${input.title} ${body} ${input.tags.join(' ')}`
  const named = subjectsFor(input.title, input.tags, 4)
  const multi = named.filter((s) => s.includes(' '))
  const single = named.filter((s) => !s.includes(' '))
  const inBody = subjectsFor(body, input.tags, 2).filter((s) => !named.includes(s) && s.includes(' '))
  const out: string[] = []
  for (const s of [...multi, ...topicSubjects(all), ...single, ...inBody]) if (!out.some((o) => o.toLowerCase() === s.toLowerCase())) out.push(s)
  return out.slice(0, max)
}

interface WikiPage {
  title?: string
  index?: number
  pageimage?: string
  original?: { source: string; width: number; height: number }
  imageinfo?: ImageInfo[]
}

interface ImageInfo {
  url: string
  thumburl?: string
  descriptionurl?: string
  mime?: string
  width: number
  height: number
  extmetadata?: Record<string, { value?: string } | undefined>
}

/** Files that are not photos of the subject */
const NOT_A_PHOTO = / vs\.? | v | and | with | meets |logo|flag|map|seal|chart|diagram|emblem|icon|signature|poster|stamp|autograph|screenshot|banner|cartoon|caricature|painting|drawing/i

const FREE_FILE = /\/wikipedia\/commons\/[^?]+\.(jpe?g|png)(\?|$)/i

const EXT_FIELDS = 'Artist|LicenseShortName|NonFree'
const INFO = `prop=imageinfo&iiprop=url|size|mime|extmetadata&iiextmetadatafilter=${EXT_FIELDS}&iiurlwidth=2000`

async function query(fetchFn: typeof fetch, params: string): Promise<WikiPage[]> {
  const res = await fetchFn(`${API}?action=query&format=json&${params}`, { headers: UA, signal: AbortSignal.timeout(15_000) })
  if (!res.ok) return []
  const json = (await res.json()) as { query?: { pages?: Record<string, WikiPage> } }
  return Object.values(json.query?.pages ?? {}).sort((a, b) => (a.index ?? 9) - (b.index ?? 9))
}

/** A name worth searching files for: a person, place or body, not a bare acronym that matches anything. */
function isSpecific(subject: string): boolean {
  return subject.trim().includes(' ') || subject.length >= 6
}

/** Licences that allow reuse with attribution. NC/ND variants and fair use are out. */
export function licenceOk(short: string): boolean {
  const s = short.trim()
  if (!s || /\b(nc|nd)\b/i.test(s) || /fair use|non-?free|copyrighted/i.test(s)) return false
  return /^(public domain|pd\b|cc0|cc[- ]by\b)/i.test(s)
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' }

/** Artist field is HTML (links, spans): plain text, short */
export function plainAuthor(html: string | undefined): string {
  const text = (html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/\s+/g, ' ')
    .trim()
  if (!text || /^(unknown|anonymous|own work|see (page|file) )/i.test(text)) return ''
  return text.length > 70 ? `${text.slice(0, 67).trimEnd()}...` : text
}

interface Candidate {
  url: string
  info: ImageInfo
  file: string
}

/** The file passes every check: free licence on Commons, a real photo, big enough, right shape */
export function acceptable(file: string, info: ImageInfo | undefined, o: Required<PhotoOpts>, strictName = false): info is ImageInfo {
  if (!info) return false
  const short = info.extmetadata?.LicenseShortName?.value ?? ''
  const nonFree = (info.extmetadata?.NonFree?.value ?? '').toLowerCase() === 'true'
  return (
    !nonFree &&
    licenceOk(short) &&
    /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(info.descriptionurl ?? '') &&
    FREE_FILE.test(info.url) &&
    /^image\/(jpeg|png)$/.test(info.mime ?? 'image/jpeg') &&
    info.width >= o.minWidth &&
    info.width >= info.height * o.minAspect &&
    !(strictName && NOT_A_PHOTO.test(file))
  )
}

async function fileInfo(fileName: string, fetchFn: typeof fetch): Promise<ImageInfo | undefined> {
  const pages = await query(fetchFn, `titles=${encodeURIComponent(`File:${fileName.replace(/_/g, ' ')}`)}&${INFO}`)
  return pages[0]?.imageinfo?.[0]
}

/** Capitalised words that can sit next to a name in a file title without being part of it. */
const NAME_NEIGHBOURS = new Set(['in', 'at', 'on', 'of', 'the', 'and', 'with', 'during', 'speaking', 'meets', 'meeting', 'visit', 'visits', 'official', 'portrait', 'photo', 'president', 'prime', 'minister', 'pm', 'dr', 'mr', 'mrs', 'ms', 'sir', 'senator', 'governor', 'general', 'chief', 'justice', 'cropped', 'file', 'img', 'dsc'])

/**
 * Does the file title use the subject as part of a longer name? "Mufti Syed Shujaat Ali Qadir" is not "Shujaat Ali":
 * a capitalised word right before or after the match (other than a title or a link word) means a different person.
 */
export function partOfLongerName(fileTitle: string, subject: string): boolean {
  const t = fold(fileTitle.replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' '))
  const raw = fileTitle.replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ')
  const s = fold(subject.trim())
  const at = t.indexOf(s)
  if (at < 0) return false
  const before = raw.slice(0, at).trim().split(/[\s,()-]+/).filter(Boolean).pop() ?? ''
  const after = raw.slice(at + s.length).trim().split(/[\s,()-]+/).filter(Boolean)[0] ?? ''
  const isName = (w: string) => /^[A-Z][a-z]{1,}$/.test(w) && !NAME_NEIGHBOURS.has(w.toLowerCase())
  return isName(before) || isName(after)
}

/** The article's lead image if it is a free Commons file of the right shape; else the best Commons file named after the subject. */
async function candidateFor(subject: string, fetchFn: typeof fetch, o: Required<PhotoOpts>): Promise<Candidate | null> {
  const q = encodeURIComponent(subject)
  const s = subject.toLowerCase()
  const lead = (await query(fetchFn, `generator=search&gsrlimit=3&gsrsearch=${q}&prop=pageimages&piprop=original|name&redirects=1`)).find(
    (p) => p.title?.toLowerCase() === s && p.pageimage && p.original && p.original.width >= o.minWidth && p.original.width >= p.original.height * o.minAspect,
  )
  if (lead?.pageimage) {
    const info = await fileInfo(lead.pageimage, fetchFn)
    if (acceptable(lead.pageimage, info, o)) return { url: info.thumburl ?? info.url, info, file: lead.pageimage }
  }
  if (!isSpecific(subject)) return null
  const files = (await query(fetchFn, `generator=search&gsrnamespace=6&gsrlimit=12&gsrsearch=${encodeURIComponent(`${subject} filetype:bitmap`)}&${INFO}`))
    .map((p) => ({ title: (p.title ?? '').replace(/^File:/, ''), info: p.imageinfo?.[0], rank: p.index ?? 9 }))
    .filter((f) => f.title.toLowerCase().includes(s) && !partOfLongerName(f.title, subject) && acceptable(f.title, f.info, o, true))
  // Landscape first (they crop least), then search order
  files.sort((a, b) => Number(b.info!.width >= b.info!.height * 1.3) - Number(a.info!.width >= a.info!.height * 1.3) || a.rank - b.rank)
  const best = files[0]
  return best?.info ? { url: best.info.thumburl ?? best.info.url, info: best.info, file: best.title } : null
}

export function buildMeta(subject: string, c: Candidate): PhotoMeta {
  const author = plainAuthor(c.info.extmetadata?.Artist?.value)
  const licence = (c.info.extmetadata?.LicenseShortName?.value ?? '').trim()
  const creditLine = ['Photo:', [author, licence, 'Wikimedia Commons'].filter(Boolean).join(' / ')].join(' ')
  const sourceUrl = c.info.descriptionurl ?? ''
  return { subject, file: c.file, author, licence, creditLine, sourceUrl, width: c.info.width, height: c.info.height, mediaCredit: sourceUrl ? `${creditLine} | ${sourceUrl}` : creditLine, provider: 'commons', fromCommons: true }
}

/**
 * A common-noun subject ("Petrol prices", "Traffic police") rather than a named person, place or body: every word after
 * the first is lower case. Commons files for these come from anywhere (an Australian pump, Malaysian police), so such a
 * photo is used only when its file name places it in Pakistan.
 */
export function isCommonTopic(subject: string): boolean {
  const words = subject.trim().split(/\s+/)
  if (words.length >= 2 && words.slice(1).every((w) => /^[a-z]/.test(w))) return true
  // Title-cased tags made of everyday words ("First Test", "Second ODI", "Final Day") name no one; Commons files
  // for them can be anything ("Smile's first test X-ray image"), so they need a Pakistan file too.
  return words.length >= 2 && words.every((w) => GENERIC_WORDS.has(w.toLowerCase().replace(/[^a-z0-9-]/g, '')))
}

const GENERIC_WORDS = new Set([
  'first', 'second', 'third', 'fourth', 'fifth', '1st', '2nd', '3rd', '4th', '5th', 'final', 'opening', 'last', 'next', 'semi-final', 'semifinal',
  'test', 'tests', 'odi', 'odis', 't20', 't20i', 'match', 'series', 'day', 'innings', 'round', 'session', 'meeting', 'phase', 'stage', 'leg', 'quarter',
])

const PK_FILE = /pakistan|karachi|lahore|islamabad|rawalpindi|peshawar|quetta|multan|faisalabad|sialkot|gujranwala|sindh|khyber|balochistan|gilgit|azad kashmir|\bpso\b/i

/** A photo of a common-noun topic must be from Pakistan; named subjects are fine anywhere. */
export function localEnough(subject: string, file: string): boolean {
  return !isCommonTopic(subject) || PK_FILE.test(file)
}

const WORSHIP_SITE = /mosque|masjid|shrine|darbar|dargah|mazar|imambargah|shareef|church|cathedral|temple|mandir|gurdwara|synagogue|\btomb\b/i

/**
 * A city's Wikipedia lead image is often a mosque or shrine (Kohat -> Ghamkol Shareef, Islamabad -> Faisal Mosque).
 * On a police-killing or crime card that reads as a religious claim, so a place photo of a worship site is used only
 * when the subject is that site itself.
 */
export function worshipSiteMismatch(subject: string, file: string): boolean {
  return WORSHIP_SITE.test(file.replace(/_/g, ' ')) && !WORSHIP_SITE.test(subject)
}

/** Try each subject in turn; the first free-licence photo that downloads wins. */
export async function findPhotoForSubjects(subjects: string[], fetchFn: typeof fetch = fetch, opts: PhotoOpts = SOCIAL): Promise<RealPhoto | null> {
  const o = { ...SOCIAL, ...opts }
  for (const subject of subjects) {
    try {
      const hit = await candidateFor(subject, fetchFn, o)
      if (!hit) continue
      if (!localEnough(subject, hit.file)) {
        logger.info({ subject, file: hit.file }, 'real photo skipped: common topic, photo not from Pakistan')
        continue
      }
      if (worshipSiteMismatch(subject, hit.file)) {
        logger.info({ subject, file: hit.file }, 'real photo skipped: worship site for a place subject')
        continue
      }
      const img = await fetchFn(hit.url, { headers: UA, signal: AbortSignal.timeout(30_000) })
      const type = (img.headers.get('content-type') ?? '').split(';')[0] ?? ''
      if (!img.ok || !/^image\/(jpeg|png)$/.test(type)) continue
      const bytes = Buffer.from(await img.arrayBuffer())
      if (bytes.length > 12_000_000 || bytes.length < 20_000) continue
      const meta = buildMeta(subject, hit)
      logger.info({ subject, file: hit.file, licence: meta.licence }, 'real photo found')
      return { dataUrl: `data:${type};base64,${bytes.toString('base64')}`, credit: meta.creditLine, bytes, mime: type, meta }
    } catch (e) {
      logger.debug({ subject, err: e instanceof Error ? e.message : e }, 'real photo lookup failed')
    }
  }
  return null
}

/** Wider net for a person the headline names: a smaller or portrait photo of the face beats a card with no photo at all. */
const PERSON_FALLBACK: Required<PhotoOpts> = { minWidth: 600, minAspect: 0.45 }

/**
 * Which of these subjects are living people? One batched Wikipedia query: a page in "Category:Living people" is a person.
 * (Historical figures are treated like any other subject; news is about the living.) Unknown on any failure.
 */
export async function livingPeople(subjects: string[], fetchFn: typeof fetch = fetch): Promise<Set<string>> {
  const out = new Set<string>()
  if (!subjects.length) return out
  try {
    const res = await fetchFn(
      `${API}?action=query&format=json&redirects=1&prop=categories&clcategories=${encodeURIComponent('Category:Living people')}&cllimit=max&titles=${encodeURIComponent(subjects.join('|'))}`,
      { headers: UA, signal: AbortSignal.timeout(15_000) },
    )
    if (!res.ok) return out
    const json = (await res.json()) as {
      query?: { normalized?: { from: string; to: string }[]; redirects?: { from: string; to: string }[]; pages?: Record<string, { title?: string; categories?: unknown[] }> }
    }
    const living = new Set(Object.values(json.query?.pages ?? {}).filter((p) => (p.categories?.length ?? 0) > 0).map((p) => (p.title ?? '').toLowerCase()))
    const hop = (m: { from: string; to: string }[] | undefined, t: string) => m?.find((x) => x.from.toLowerCase() === t.toLowerCase())?.to ?? t
    for (const s of subjects) if (living.has(hop(json.query?.redirects, hop(json.query?.normalized, s)).toLowerCase())) out.add(s)
  } catch (e) {
    logger.debug({ err: e instanceof Error ? e.message : e }, 'person check failed')
  }
  return out
}

/** Subjects reordered people first (stable inside each group): a face beats a building. */
export function peopleFirst(subjects: string[], people: Set<string>): string[] {
  return [...subjects.filter((s) => people.has(s)), ...subjects.filter((s) => !people.has(s))]
}

/**
 * Social cards: entities named in the headline, people first, then organisations, then places and buildings.
 * A headline that names a person does not go photo-less while any free photo of that person exists (relaxed size and
 * shape on the second pass). `meta.subject` says whose face or place the photo shows.
 */
export async function findRealPhoto(title: string, tags: string[], fetchFn: typeof fetch = fetch): Promise<RealPhoto | null> {
  const subjects = subjectsFor(title, tags, 4)
  if (!subjects.length) return null
  const people = await livingPeople(subjects, fetchFn)
  const ordered = peopleFirst(subjects, people)
  const hit = await findPhotoForSubjects(ordered, fetchFn, SOCIAL)
  if (hit) return hit
  const named = ordered.filter((s) => people.has(s))
  return named.length ? findPhotoForSubjects(named, fetchFn, PERSON_FALLBACK) : null
}

/**
 * Article heroes: named entities, then topic fallbacks (US election -> the Capitol). People the headline names come first,
 * so "Trump Nobel Peace Prize push by Shehbaz Sharif" shows Trump or Shehbaz, not a 1994 Nobel ceremony.
 */
export async function findHeroPhoto(input: { title: string; dek?: string; brief?: string; tags: string[] }, fetchFn: typeof fetch = fetch): Promise<RealPhoto | null> {
  const subjects = heroSubjects(input)
  const named = subjectsFor(input.title, input.tags, 4)
  const people = named.length ? await livingPeople(named, fetchFn) : new Set<string>()
  return findPhotoForSubjects(peopleFirst(subjects, people), fetchFn, HERO)
}
