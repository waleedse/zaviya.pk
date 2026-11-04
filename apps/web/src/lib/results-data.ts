import 'server-only'
import { unstable_cache } from 'next/cache'

import { getPayloadClient } from './payload'
import { RESULTS_TAG } from './revalidate'
import {
  boardDefBySlug,
  boardNewsKeywords,
  RESULT_BOARDS,
  type BoardDef,
  type ExamStatus,
  type ExamView,
  type ExamSession,
  type ResultClass,
} from './result-boards'
import type { ClosureView, VacationRegion, VacationView } from './vacations'
import { VACATION_REGIONS } from './vacations'
import type { ResultBoard, ResultExam, VacationNotice, SchoolClosure } from '../payload-types'

export interface BoardView extends BoardDef {
  smsCode?: string
  smsHowTo?: string
  resultUrl?: string
  gazetteUrl?: string
  notes?: string
  faqs: { q: string; a: string }[]
  checkedAt?: string
  updatedAt?: string
}

const opt = (v: string | null | undefined): string | undefined => (v ? v : undefined)

function mergeBoard(def: BoardDef, doc?: ResultBoard): BoardView {
  return {
    ...def,
    name: doc?.name || def.name,
    officialSite: opt(doc?.officialSite) ?? def.officialSite,
    resultUrl: opt(doc?.resultUrl),
    smsCode: opt(doc?.smsCode),
    smsHowTo: opt(doc?.smsHowTo),
    gazetteUrl: opt(doc?.gazetteUrl),
    notes: opt(doc?.notes),
    faqs: (doc?.faqs ?? []).map((f) => ({ q: f.q, a: f.a })),
    checkedAt: opt(doc?.checkedAt),
    updatedAt: doc?.updatedAt,
  }
}

async function loadBoards(): Promise<BoardView[]> {
  const payload = await getPayloadClient()
  const res = await payload.find({ collection: 'result-boards', limit: 200, pagination: false, depth: 0, overrideAccess: true })
  const bySlug = new Map(res.docs.map((d) => [d.slug, d]))
  return RESULT_BOARDS.map((def) => mergeBoard(def, bySlug.get(def.slug)))
}

function mapExam(d: ResultExam): ExamView | null {
  const board = typeof d.board === 'object' && d.board ? d.board : null
  if (!board) return null
  return {
    id: d.id,
    boardSlug: board.slug,
    classLevel: Number(d.classLevel) as ResultClass,
    session: d.session as ExamSession,
    year: d.year,
    status: d.status as ExamStatus,
    expectedDate: opt(d.expectedDate),
    announcedDate: opt(d.announcedDate),
    sourceUrl: opt(d.sourceUrl),
    sourceNote: opt(d.sourceNote),
    resultLink: opt(d.resultLink),
    gazetteUrl: opt(d.gazetteUrl),
    positionHolders: opt(d.positionHolders),
    passPercentage: opt(d.passPercentage),
    notes: opt(d.notes),
    checkedAt: opt(d.checkedAt),
    updatedAt: d.updatedAt,
  }
}

async function loadExams(): Promise<ExamView[]> {
  const payload = await getPayloadClient()
  const res = await payload.find({ collection: 'result-exams', limit: 2000, pagination: false, depth: 1, overrideAccess: true })
  return res.docs.map(mapExam).filter((e): e is ExamView => Boolean(e))
}

const cachedBoards = unstable_cache(loadBoards, ['results-boards'], { revalidate: 300, tags: [RESULTS_TAG] })
const cachedExams = unstable_cache(loadExams, ['results-exams'], { revalidate: 300, tags: [RESULTS_TAG] })

/** Never throws: if Payload (or the tables, before the migration ran) fail, the directory still renders with "not announced yet". */
export async function getBoards(): Promise<BoardView[]> {
  try {
    return await cachedBoards()
  } catch {
    return RESULT_BOARDS.map((d) => mergeBoard(d))
  }
}

export async function getBoard(slug: string): Promise<BoardView | undefined> {
  return (await getBoards()).find((b) => b.slug === slug)
}

export async function getExams(): Promise<ExamView[]> {
  try {
    return await cachedExams()
  } catch {
    return []
  }
}

export interface NewsLink {
  title: string
  href: string
  publishedAt: string
}

async function loadBoardNews(slug: string): Promise<NewsLink[]> {
  const board = boardDefBySlug(slug)
  if (!board) return []
  const payload = await getPayloadClient()
  const res = await payload.find({
    collection: 'articles',
    locale: 'en',
    where: {
      and: [
        { _status: { equals: 'published' } },
        { workflow: { not_equals: 'retracted' } },
        { or: boardNewsKeywords(board).map((k) => ({ title: { like: k } })) },
      ],
    },
    sort: '-publishedAt',
    limit: 6,
    depth: 1,
    select: { title: true, slug: true, category: true, publishedAt: true },
    overrideAccess: true,
  })
  return res.docs.map((a) => {
    const cat = typeof a.category === 'object' && a.category ? (a.category as { slug: string }).slug : 'pakistan'
    return { title: String(a.title ?? ''), href: `/${cat}/${String(a.slug ?? '')}`, publishedAt: String(a.publishedAt ?? '') }
  })
}

const cachedBoardNews = unstable_cache(loadBoardNews, ['results-news'], { revalidate: 300, tags: [RESULTS_TAG, 'shared-data'] })

/** The newest published stories that name this board in their headline. */
export async function getBoardNews(slug: string): Promise<NewsLink[]> {
  try {
    return (await cachedBoardNews(slug)).filter((n) => n.title && n.href)
  } catch {
    return []
  }
}

// ---- vacations and closures --------------------------------------------------------------------

function mapVacation(d: VacationNotice): VacationView {
  return {
    region: d.region as VacationRegion,
    status: d.status as VacationView['status'],
    startDate: opt(d.startDate),
    endDate: opt(d.endDate),
    sourceUrl: opt(d.sourceUrl),
    sourceNote: opt(d.sourceNote),
    sourceDate: opt(d.sourceDate),
    lastYear: d.lastYear
      ? { startDate: opt(d.lastYear.startDate), endDate: opt(d.lastYear.endDate), note: opt(d.lastYear.note), sourceUrl: opt(d.lastYear.sourceUrl) }
      : undefined,
    notes: opt(d.notes),
    updatedAt: d.updatedAt,
  }
}

async function loadVacations(): Promise<VacationView[]> {
  const payload = await getPayloadClient()
  const res = await payload.find({ collection: 'vacation-notices', limit: 50, pagination: false, depth: 0, overrideAccess: true })
  const byRegion = new Map(res.docs.map((d) => [d.region, mapVacation(d)]))
  return VACATION_REGIONS.map((r) => byRegion.get(r.slug) ?? { region: r.slug, status: 'not_announced' })
}

const cachedVacations = unstable_cache(loadVacations, ['results-vacations'], { revalidate: 300, tags: [RESULTS_TAG] })

export async function getVacations(): Promise<VacationView[]> {
  try {
    return await cachedVacations()
  } catch {
    return VACATION_REGIONS.map((r) => ({ region: r.slug, status: 'not_announced' as const }))
  }
}

async function loadClosures(): Promise<ClosureView[]> {
  const payload = await getPayloadClient()
  const res = await payload.find({ collection: 'school-closures', sort: '-date', limit: 300, pagination: false, depth: 0, overrideAccess: true })
  return res.docs.map((d: SchoolClosure) => ({
    id: d.id,
    region: d.region as VacationRegion,
    scope: d.scope,
    date: d.date,
    endDate: opt(d.endDate),
    reason: d.reason as ClosureView['reason'],
    status: d.status as ClosureView['status'],
    sourceUrl: opt(d.sourceUrl),
    sourceNote: opt(d.sourceNote),
    notes: opt(d.notes),
    updatedAt: d.updatedAt,
  }))
}

const cachedClosures = unstable_cache(loadClosures, ['results-closures'], { revalidate: 300, tags: [RESULTS_TAG] })

export async function getClosures(): Promise<ClosureView[]> {
  try {
    return await cachedClosures()
  } catch {
    return []
  }
}

export interface DerivedEvent {
  title: string
  date: string
  kind: string
  href: string
}

/** Dated rows for the homepage "Coming up" block, taken only from sourced records: expected result dates and notified/reported winter breaks. */
export async function getDerivedUpcoming(today: string): Promise<DerivedEvent[]> {
  const [exams, vacations, boards] = await Promise.all([getExams(), getVacations(), getBoards()])
  const names = new Map(boards.map((b) => [b.slug, b.name]))
  const out: DerivedEvent[] = []
  for (const e of exams) {
    if (e.status === 'expected' && e.expectedDate && e.expectedDate >= today && (e.sourceUrl || e.sourceNote)) {
      out.push({ title: `${names.get(e.boardSlug) ?? e.boardSlug} class ${e.classLevel} result expected`, date: e.expectedDate, kind: 'results', href: `/results/${e.boardSlug}/class-${e.classLevel}` })
    }
  }
  for (const v of vacations) {
    if (v.status !== 'not_announced' && v.startDate && v.startDate >= today && (v.sourceUrl || v.sourceNote)) {
      const name = VACATION_REGIONS.find((r) => r.slug === v.region)?.name ?? v.region
      out.push({ title: `${name} winter vacations begin`, date: v.startDate, kind: 'education', href: `/winter-vacations-2026-27/${v.region}` })
    }
  }
  return out
}
