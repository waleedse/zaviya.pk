import { describe, expect, it } from 'vitest'
import {
  detectClass,
  examsFor,
  headlineExam,
  matchResultBoards,
  parseClassSegment,
  RESULT_BOARDS,
  sortExams,
  statusText,
  type ExamView,
} from '../../src/lib/result-boards'
import { boardFaqs, lastUpdated, resultYear, whenAnswer } from '../../src/lib/results-content'
import type { BoardView } from '../../src/lib/results-data'

const view = (slug: string): BoardView => ({ ...RESULT_BOARDS.find((b) => b.slug === slug)!, faqs: [] })

describe('board directory', () => {
  it('has unique slugs and only https official sites', () => {
    const slugs = RESULT_BOARDS.map((b) => b.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const b of RESULT_BOARDS) {
      if (b.officialSite) expect(b.officialSite).toMatch(/^https:\/\/[a-z0-9.-]+\/$/)
    }
  })
  it('covers every province, FBISE and both Karachi boards', () => {
    const regions = new Set(RESULT_BOARDS.map((b) => b.region))
    for (const r of ['punjab', 'sindh', 'kp', 'balochistan', 'ajk', 'federal']) expect(regions.has(r as never)).toBe(true)
    expect(RESULT_BOARDS.filter((b) => b.region === 'punjab')).toHaveLength(9)
    expect(RESULT_BOARDS.find((b) => b.slug === 'bsek')!.classes).toEqual([9, 10])
    expect(RESULT_BOARDS.find((b) => b.slug === 'biek')!.classes).toEqual([11, 12])
  })
  it('parses class segments', () => {
    expect(parseClassSegment('class-9')).toBe(9)
    expect(parseClassSegment('class-12')).toBe(12)
    expect(parseClassSegment('class-8')).toBeNull()
    expect(parseClassSegment('9')).toBeNull()
  })
})

describe('never invents a date', () => {
  it('a board with no exam rows is "Not announced yet" for the given year', () => {
    const e = headlineExam([], 'bise-multan', 9, 2026)
    expect(e.status).toBe('not_announced')
    expect(e.year).toBe(2026)
    expect(statusText(e)).toBe('Not announced yet')
    expect(e.expectedDate).toBeUndefined()
  })
  it('shows a date only for an exam row that has one', () => {
    expect(statusText({ status: 'expected', expectedDate: '2026-11-25' })).toBe('Expected on 25 November 2026')
    expect(statusText({ status: 'announced', announcedDate: '2026-09-02' })).toBe('Announced on 2 September 2026')
    expect(statusText({ status: 'expected' })).toBe('Not announced yet')
  })
  it('answers "kab aayega" without a date when none exists', () => {
    const b = view('bise-multan')
    expect(whenAnswer(b, 9, headlineExam([], b.slug, 9, 2026))).toMatch(/has not announced/)
    expect(boardFaqs(b, [], 2026).some((f) => /\d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December)/.test(f.a))).toBe(false)
  })
  it('puts the newest cycle first (supplementary before annual within a year)', () => {
    const mk = (year: number, session: 'annual' | 'supplementary'): ExamView => ({ boardSlug: 'x', classLevel: 9, session, year, status: 'not_announced' })
    const sorted = sortExams([mk(2025, 'annual'), mk(2026, 'annual'), mk(2026, 'supplementary')])
    expect(sorted.map((e) => `${e.year}-${e.session}`)).toEqual(['2026-supplementary', '2026-annual', '2025-annual'])
    expect(examsFor(sorted, 'x', 10)).toHaveLength(0)
  })
  it('last updated is the newest check or update, undefined when there is none', () => {
    const b = view('bise-multan')
    expect(lastUpdated(b, [])).toBeUndefined()
    expect(lastUpdated({ ...b, checkedAt: '2026-11-01' }, [{ boardSlug: b.slug, classLevel: 9, session: 'annual', year: 2026, status: 'announced', checkedAt: '2026-11-03' }])).toBe('2026-11-03')
  })
  it('year follows the Pakistan calendar', () => {
    expect(resultYear(new Date('2026-12-31T20:00:00Z'))).toBe(2027)
    expect(resultYear(new Date('2026-12-31T10:00:00Z'))).toBe(2026)
  })
})

describe('result stories link to board pages', () => {
  it('maps a BISE headline to the board class page', () => {
    const m = matchResultBoards('BISE Shaheed Benazirabad announces class 9 result 2026')
    expect(m[0]!.board.slug).toBe('bise-shaheed-benazirabad')
    expect(m[0]!.href).toBe('/results/bise-shaheed-benazirabad/class-9')
  })
  it('falls back to the board page without a class, and ignores non-result stories', () => {
    expect(matchResultBoards('Multan board result today')[0]!.href).toBe('/results/bise-multan')
    expect(matchResultBoards('Multan Sultans win by five wickets')).toEqual([])
    expect(matchResultBoards('BISE Multan holds a meeting on new buildings')).toEqual([])
    expect(matchResultBoards('Federal Board of Revenue announced a new deadline')).toEqual([])
  })
  it('does not confuse Mirpur (AJK) with Mirpurkhas, or the Karachi boards', () => {
    expect(matchResultBoards('BISE Mirpurkhas result announced')[0]!.board.slug).toBe('bise-mirpurkhas')
    expect(matchResultBoards('BISE Mirpur result announced')[0]!.board.slug).toBe('bise-mirpur-ajk')
    expect(matchResultBoards('Karachi board class 11 result declared')[0]!.board.slug).toBe('biek')
    expect(matchResultBoards('Karachi board matric result declared')[0]!.board.slug).toBe('bsek')
    expect(matchResultBoards('BSEK class 11 result')[0]!.href).toBe('/results/bsek')
  })
  it('detects classes', () => {
    expect(detectClass('9th class result')).toBe(9)
    expect(detectClass('matric result')).toBe(10)
    expect(detectClass('inter part 2 result')).toBe(12)
    expect(detectClass('first year result')).toBe(11)
    expect(detectClass('result today')).toBeUndefined()
  })
})
