/**
 * Pakistani education boards for the /results pages. This file is only the stable directory (names, province, which
 * classes a board runs, the official site we checked by opening it). Everything that changes (dates, status, links,
 * SMS codes) lives in Payload: collections `result-boards` and `result-exams`. A date is never written here.
 */

export type BoardRegion = 'punjab' | 'sindh' | 'kp' | 'balochistan' | 'ajk' | 'federal'
export type ResultClass = 9 | 10 | 11 | 12
export type ExamSession = 'annual' | 'supplementary'
export type ExamStatus = 'not_announced' | 'expected' | 'announced'

export const RESULT_CLASSES: ResultClass[] = [9, 10, 11, 12]

export const REGION_LABEL: Record<BoardRegion, string> = {
  punjab: 'Punjab',
  sindh: 'Sindh',
  kp: 'Khyber Pakhtunkhwa',
  balochistan: 'Balochistan',
  ajk: 'Azad Kashmir',
  federal: 'Federal (Islamabad)',
}
export const REGION_ORDER: BoardRegion[] = ['federal', 'punjab', 'sindh', 'kp', 'balochistan', 'ajk']

export const CLASS_LABEL: Record<ResultClass, string> = {
  9: 'Class 9 (SSC Part I)',
  10: 'Class 10 (SSC Part II, matric)',
  11: 'Class 11 (HSSC Part I, first year)',
  12: 'Class 12 (HSSC Part II, second year)',
}

export interface BoardDef {
  slug: string
  /** Full name used in headings: "BISE Multan" */
  name: string
  /** How people search for it */
  searchName: string
  region: BoardRegion
  city: string
  classes: ResultClass[]
  /** Official website, only where we opened it and it was the board's own site; empty = not verified yet */
  officialSite?: string
  /** Words that identify this board in a headline (case-insensitive, whole words) */
  keywords: string[]
}

const ALL: ResultClass[] = [9, 10, 11, 12]

function bise(slug: string, city: string, region: BoardRegion, officialSite: string | undefined, extra: string[] = [], name = `BISE ${city}`): BoardDef {
  return {
    slug,
    name,
    searchName: name,
    region,
    city,
    classes: ALL,
    officialSite,
    keywords: [`BISE ${city}`, `${city} board`, `${city} BISE`, ...extra],
  }
}

export const RESULT_BOARDS: BoardDef[] = [
  { slug: 'fbise', name: 'FBISE (Federal Board)', searchName: 'FBISE', region: 'federal', city: 'Islamabad', classes: ALL, officialSite: 'https://fbise.edu.pk/', keywords: ['FBISE', 'Federal Board', 'Federal Board of Intermediate and Secondary Education'] },
  bise('bise-lahore', 'Lahore', 'punjab', 'https://biselahore.com/'),
  bise('bise-gujranwala', 'Gujranwala', 'punjab', 'https://bisegrw.edu.pk/', ['BISE GRW', 'Gujranwala Board']),
  bise('bise-faisalabad', 'Faisalabad', 'punjab', 'https://bisefsd.edu.pk/', ['BISE FSD']),
  bise('bise-rawalpindi', 'Rawalpindi', 'punjab', 'https://biserawalpindi.edu.pk/', ['BISE RWP', 'Pindi board']),
  bise('bise-multan', 'Multan', 'punjab', 'https://web.bisemultan.edu.pk/', ['Multan Education Board']),
  bise('bise-sargodha', 'Sargodha', 'punjab', 'https://bisesargodha.edu.pk/'),
  bise('bise-bahawalpur', 'Bahawalpur', 'punjab', 'https://bisebwp.edu.pk/', ['BISE BWP']),
  bise('bise-dg-khan', 'DG Khan', 'punjab', 'https://bisedgkhan.edu.pk/', ['D.G. Khan board', 'Dera Ghazi Khan board', 'BISE Dera Ghazi Khan']),
  bise('bise-sahiwal', 'Sahiwal', 'punjab', 'https://bisesahiwal.edu.pk/'),
  { slug: 'bsek', name: 'BSEK Karachi (Matric Board)', searchName: 'BSEK', region: 'sindh', city: 'Karachi', classes: [9, 10], officialSite: 'https://bsek.edu.pk/', keywords: ['BSEK', 'Board of Secondary Education Karachi', 'Karachi matric board'] },
  { slug: 'biek', name: 'BIEK Karachi (Inter Board)', searchName: 'BIEK', region: 'sindh', city: 'Karachi', classes: [11, 12], officialSite: 'https://biek.edu.pk/', keywords: ['BIEK', 'Board of Intermediate Education Karachi', 'Karachi inter board'] },
  bise('bise-hyderabad', 'Hyderabad', 'sindh', 'https://biseh.edu.pk/'),
  bise('bise-larkana', 'Larkana', 'sindh', 'https://biselrk.com/', ['BISE Larkano']),
  bise('bise-sukkur', 'Sukkur', 'sindh', undefined),
  bise('bise-mirpurkhas', 'Mirpurkhas', 'sindh', undefined),
  bise('bise-shaheed-benazirabad', 'Shaheed Benazirabad', 'sindh', 'https://bisesba.edu.pk/', ['BISE Benazirabad', 'Benazirabad board', 'Nawabshah board', 'BISE Nawabshah'], 'BISE Shaheed Benazirabad'),
  bise('bise-peshawar', 'Peshawar', 'kp', 'https://bisep.edu.pk/', ['BISEP']),
  bise('bise-mardan', 'Mardan', 'kp', 'https://web.bisemdn.edu.pk/'),
  bise('bise-abbottabad', 'Abbottabad', 'kp', 'https://biseatd.edu.pk/'),
  bise('bise-kohat', 'Kohat', 'kp', 'https://bisekt.edu.pk/'),
  bise('bise-bannu', 'Bannu', 'kp', 'https://biseb.edu.pk/'),
  bise('bise-dera-ismail-khan', 'DI Khan', 'kp', 'https://bisedik.edu.pk/', ['D.I. Khan board', 'Dera Ismail Khan board', 'BISE Dera Ismail Khan', 'BISE DIK']),
  bise('bise-swat', 'Swat', 'kp', undefined),
  bise('bise-malakand', 'Malakand', 'kp', 'https://bisemalakand.edu.pk/'),
  { slug: 'bise-quetta', name: 'BBISE Quetta', searchName: 'BISE Quetta', region: 'balochistan', city: 'Quetta', classes: ALL, officialSite: 'https://bbise.edu.pk/', keywords: ['BBISE', 'BISE Quetta', 'Quetta board', 'Balochistan board'] },
  bise('bise-mirpur-ajk', 'Mirpur', 'ajk', undefined, ['AJK board', 'BISE AJK', 'Mirpur AJK board'], 'BISE Mirpur (AJK)'),
  bise('bise-rawalakot', 'Rawalakot', 'ajk', undefined, ['BISE Poonch', 'Poonch board'], 'BISE Rawalakot (AJK)'),
]

export const boardDefBySlug = (slug: string): BoardDef | undefined => RESULT_BOARDS.find((b) => b.slug === slug)

export const resultsPath = (): string => '/results'
export const boardPath = (slug: string): string => `/results/${slug}`
export const classPath = (slug: string, c: ResultClass): string => `/results/${slug}/class-${c}`

/** 'class-9' -> 9 */
export function parseClassSegment(seg: string): ResultClass | null {
  const m = /^class-(9|10|11|12)$/.exec(seg)
  return m ? (Number(m[1]) as ResultClass) : null
}

export interface ExamView {
  id?: number | string
  boardSlug: string
  classLevel: ResultClass
  session: ExamSession
  year: number
  status: ExamStatus
  /** YYYY-MM-DD */
  expectedDate?: string
  announcedDate?: string
  sourceUrl?: string
  sourceNote?: string
  resultLink?: string
  gazetteUrl?: string
  positionHolders?: string
  passPercentage?: string
  notes?: string
  /** YYYY-MM-DD the editor/agent last checked the board */
  checkedAt?: string
  updatedAt?: string
}

const SESSION_RANK: Record<ExamSession, number> = { annual: 1, supplementary: 0 }

/** Newest cycle first: higher year first, and within a year the supplementary exam (held after the annual one) before the annual. */
export function sortExams(exams: ExamView[]): ExamView[] {
  return [...exams].sort((a, b) => b.year - a.year || SESSION_RANK[a.session] - SESSION_RANK[b.session])
}

export function examsFor(exams: ExamView[], boardSlug: string, c?: ResultClass): ExamView[] {
  return sortExams(exams.filter((e) => e.boardSlug === boardSlug && (c === undefined || e.classLevel === c)))
}

/**
 * The exam a class page leads with: the newest cycle, or a synthetic "not announced yet" entry for the given year.
 * A date is shown only for an exam row that has a source (the collection refuses one without).
 */
export function headlineExam(exams: ExamView[], boardSlug: string, c: ResultClass, year: number): ExamView {
  return (
    examsFor(exams, boardSlug, c)[0] ?? { boardSlug, classLevel: c, session: 'annual', year, status: 'not_announced' }
  )
}

export function dateLabel(date: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${date}T12:00:00Z`))
}

/** "Not announced yet", "Expected on 12 November 2026", "Announced on 2 September 2026". */
export function statusText(e: Pick<ExamView, 'status' | 'expectedDate' | 'announcedDate'>): string {
  if (e.status === 'announced') return e.announcedDate ? `Announced on ${dateLabel(e.announcedDate)}` : 'Announced'
  if (e.status === 'expected' && e.expectedDate) return `Expected on ${dateLabel(e.expectedDate)}`
  return 'Not announced yet'
}

export const sessionLabel = (s: ExamSession): string => (s === 'annual' ? 'Annual' : 'Supplementary')

export function examTitle(e: Pick<ExamView, 'classLevel' | 'session' | 'year'>): string {
  return `Class ${e.classLevel} ${sessionLabel(e.session).toLowerCase()} ${e.year}`
}

// ---- Matching news headlines to boards -------------------------------------------------------------

const RESULT_WORDS = /\b(results?|date ?sheet|roll ?(no|number)s?|slips?|gazette|toppers?|position holders?|supplementary|annual exams?|re-?checking|re-?totall?ing|marks|declared|announced)\b/i

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Which class a headline is about: 9, 10, 11, 12 or undefined when it does not say. */
export function detectClass(text: string): ResultClass | undefined {
  const t = text.toLowerCase()
  if (/\b(9th|ninth|class[- ]?(9|ix)|grade 9|ssc part[- ]?(1|i)|matric part[- ]?(1|i))\b/.test(t)) return 9
  if (/\b(10th|tenth|class[- ]?(10|x)|grade 10|ssc part[- ]?(2|ii)|matric part[- ]?(2|ii))\b/.test(t)) return 10
  if (/\b(11th|class[- ]?(11|xi)|first year|1st year|(hssc|inter|intermediate|fsc|fa|ics|i\.?com) part[- ]?(1|i)|part[- ]?(1|i) (inter|intermediate))\b/.test(t)) return 11
  if (/\b(12th|class[- ]?(12|xii)|second year|2nd year|(hssc|inter|intermediate|fsc|fa|ics|i\.?com) part[- ]?(2|ii)|part[- ]?(2|ii) (inter|intermediate))\b/.test(t)) return 12
  if (/\bmatric(ulation)?\b/.test(t)) return 10
  return undefined
}

export interface BoardMatch {
  board: BoardDef
  classLevel?: ResultClass
  href: string
}

/** Boards a result story is about (a story must read like a result/exam story). Empty for everything else. */
export function matchResultBoards(text: string): BoardMatch[] {
  text = text.replace(/Federal Board of Revenue/gi, 'FBR')
  if (!RESULT_WORDS.test(text)) return []
  const classLevel = detectClass(text)
  const found: BoardMatch[] = []
  for (const board of RESULT_BOARDS) {
    const hit = board.keywords.some((k) => new RegExp(`(^|[^A-Za-z0-9])${escapeRe(k).replace(/\\? /g, '[\\s.-]+')}(?![A-Za-z0-9])`, 'i').test(text))
    if (!hit) continue
    const cls = classLevel && board.classes.includes(classLevel) ? classLevel : undefined
    found.push({ board, classLevel: cls, href: cls ? classPath(board.slug, cls) : boardPath(board.slug) })
  }
  // "Karachi board" without naming BSEK/BIEK: pick by class
  if (!found.length && /\bkarachi (education )?board\b/i.test(text)) {
    const slug = classLevel === 11 || classLevel === 12 ? 'biek' : 'bsek'
    const board = boardDefBySlug(slug)!
    found.push({ board, classLevel, href: classLevel && board.classes.includes(classLevel) ? classPath(slug, classLevel) : boardPath(slug) })
  }
  return found.slice(0, 3)
}

/** Title words used to find the latest news about a board. */
export function boardNewsKeywords(board: BoardDef): string[] {
  return board.keywords.filter((k) => k.length >= 4)
}
