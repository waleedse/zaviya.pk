import {
  CLASS_LABEL,
  dateLabel,
  examTitle,
  headlineExam,
  statusText,
  type BoardDef,
  type ExamView,
  type ResultClass,
} from './result-boards'
import type { BoardView } from './results-data'

/** Words and FAQs for the result pages, built only from the data we hold. No date appears unless an exam row carries one. */

export const FAKE_SITE_WARNING =
  'Check results only on the board\'s own website or by its official SMS service. Sites that ask for money, a phone number or an app download to "unlock" a result are not the board.'

export function resultYear(now: Date = new Date()): number {
  return new Date(now.getTime() + 5 * 3_600_000).getUTCFullYear()
}

export const officialLink = (b: BoardView): string | undefined => b.resultUrl ?? b.officialSite

/** Latest "last updated" day we can stand behind: the newest of the exam rows' updates and checks, else the board record's. */
export function lastUpdated(b: BoardView, exams: ExamView[]): string | undefined {
  const days = [
    ...exams.flatMap((e) => [e.checkedAt, e.updatedAt?.slice(0, 10)]),
    b.checkedAt,
    b.updatedAt?.slice(0, 10),
  ].filter((d): d is string => Boolean(d))
  return days.sort().pop()
}

export function whenAnswer(b: Pick<BoardDef, 'name'>, c: ResultClass, e: ExamView): string {
  if (e.status === 'announced') {
    return `${b.name} announced the ${examTitle({ ...e, classLevel: c })} result${e.announcedDate ? ` on ${dateLabel(e.announcedDate)}` : ''}${e.sourceNote ? ` (source: ${e.sourceNote})` : ''}. Open the official link on this page and enter your roll number.`
  }
  if (e.status === 'expected' && e.expectedDate) {
    return `The expected date for the ${CLASS_LABEL[c]} result is ${dateLabel(e.expectedDate)}${e.sourceNote ? ` (source: ${e.sourceNote})` : ''}. Boards can move a date, so this page is updated the moment ${b.name} confirms it.`
  }
  return `${b.name} has not announced the ${CLASS_LABEL[c]} result date yet, and we will not guess one. This page changes as soon as the board or a named report gives a date.`
}

export function boardFaqs(b: BoardView, exams: ExamView[], year: number): { q: string; a: string }[] {
  const faqs: { q: string; a: string }[] = []
  for (const c of b.classes) {
    const e = headlineExam(exams, b.slug, c, year)
    faqs.push({ q: `${b.name} class ${c} result ${year} kab aayega? (When is it?)`, a: whenAnswer(b, c, e) })
  }
  faqs.push({
    q: `How do I check my ${b.name} result by roll number?`,
    a: `Open the board's official site${officialLink(b) ? ` (${officialLink(b)})` : ''}, choose your class and exam, type your roll number and submit. Keep your admit card or roll number slip ready.`,
  })
  faqs.push({
    q: `Does ${b.name} send the result by SMS?`,
    a: b.smsCode
      ? `Yes. ${b.smsHowTo ?? `Send your roll number to ${b.smsCode}.`} Standard network charges apply.`
      : `We have not verified an SMS service for ${b.name}. Use the board's website or ask your school; we add the code here only when the board publishes it.`,
  })
  faqs.push({ q: 'Is this the official result?', a: `No. Zaviya is a news site. We link to ${b.name}'s own result page and report dates with their source. ${FAKE_SITE_WARNING}` })
  faqs.push(...b.faqs)
  return faqs
}

export function classFaqs(b: BoardView, c: ResultClass, exams: ExamView[], year: number): { q: string; a: string }[] {
  const e = headlineExam(exams, b.slug, c, year)
  const list = [
    { q: `${b.name} class ${c} result ${year} kab aayega? (When is it?)`, a: whenAnswer(b, c, e) },
    { q: `How can I check the ${b.name} class ${c} result?`, a: `Open the official link on this page, pick Class ${c}, enter your roll number and submit.${b.smsCode ? ` You can also send the roll number to ${b.smsCode}.` : ''}` },
    { q: 'What if the board website is slow or down?', a: 'Result days overload every board site. Try again after a few minutes, use the SMS service if the board has one, or ask your school, which gets the gazette the same day.' },
    { q: 'How do I apply for rechecking?', a: `Boards open a rechecking window after the result and publish the last date and fee in their notice. Apply through your school or the board's site within that window; we link the notice here when ${b.name} publishes it.` },
  ]
  return list
}

export function exTable(b: BoardView, exams: ExamView[], year: number) {
  return b.classes.map((c) => ({ c, e: headlineExam(exams, b.slug, c, year), text: statusText(headlineExam(exams, b.slug, c, year)) }))
}
