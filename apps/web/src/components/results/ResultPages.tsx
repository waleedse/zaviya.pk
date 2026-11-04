import Link from 'next/link'
import { GraduationCap, ShieldAlert } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'
import { FAQAccordion } from '@/components/article/FAQAccordion'
import { JsonLd } from '@/components/seo/JsonLd'
import { absoluteUrl, breadcrumbJsonLd, faqJsonLd } from '@/lib/seo'
import {
  boardPath,
  classPath,
  CLASS_LABEL,
  dateLabel,
  examsFor,
  examTitle,
  headlineExam,
  REGION_LABEL,
  REGION_ORDER,
  resultsPath,
  statusText,
  type ExamView,
  type ResultClass,
} from '@/lib/result-boards'
import type { BoardView, NewsLink } from '@/lib/results-data'
import { boardFaqs, classFaqs, exTable, FAKE_SITE_WARNING, lastUpdated, officialLink } from '@/lib/results-content'
import type { LatestLink } from '@/lib/queries'

const COLOR = '#0f766e'
const CLASSES: ResultClass[] = [9, 10, 11, 12]

function OfficialLink({ board }: { board: BoardView }) {
  const url = officialLink(board)
  if (!url) {
    return (
      <p className="rounded-2xl border border-border bg-surface p-4 text-sm">
        We have not yet verified the official website of {board.name}, so we do not link one. Use the web address printed on your roll number slip or ask your school.
      </p>
    )
  }
  return (
    <p className="rounded-2xl border border-border bg-surface p-4">
      <span className="block text-sm font-semibold uppercase tracking-wide text-fg-muted">Official result link</span>
      <a href={url} rel="noopener" className="mt-1 inline-block break-all text-lg font-bold text-accent underline">
        {url}
      </a>
    </p>
  )
}

function Warning() {
  return (
    <p className="flex gap-3 rounded-2xl bg-surface-2 p-4 text-sm">
      <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <span>
        <strong>Fake result sites:</strong> {FAKE_SITE_WARNING}
      </span>
    </p>
  )
}

function Sources({ e }: { e: ExamView }) {
  if (e.status === 'not_announced') return <span className="text-fg-muted">No source yet</span>
  return e.sourceUrl ? (
    <a href={e.sourceUrl} rel="noopener nofollow" className="underline">
      {e.sourceNote ?? 'Source'}
    </a>
  ) : (
    <span>{e.sourceNote}</span>
  )
}

function NewsBlock({ items, title }: { items: NewsLink[]; title: string }) {
  if (!items.length) return null
  return (
    <section>
      <h2 className="font-display text-xl font-bold">{title}</h2>
      <ul className="mt-3 divide-y divide-border">
        {items.map((n) => (
          <li key={n.href} className="py-2">
            <Link href={n.href} className="font-semibold hover:text-accent">
              {n.title}
            </Link>
            {n.publishedAt ? <span className="ms-2 text-xs text-fg-subtle">{dateLabel(n.publishedAt.slice(0, 10))}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

function jsonLd(path: string, name: string, crumbs: { name: string; url: string }[], faqs: { q: string; a: string }[], modified?: string) {
  return [
    breadcrumbJsonLd(crumbs),
    faqJsonLd(faqs),
    { '@context': 'https://schema.org', '@type': 'WebPage', name, url: absoluteUrl(path), ...(modified ? { dateModified: modified } : {}), inLanguage: 'en' },
  ]
}

export function ResultsHub({ boards, exams, year, latest }: { boards: BoardView[]; exams: ExamView[]; year: number; latest: LatestLink[] }) {
  const faqs = [
    { q: `Board result ${year} date: when do results come?`, a: 'Each board announces its own dates. This page shows a date only when the board or a named news report gave one, with the source and the day we last checked. Otherwise it says "Not announced yet".' },
    { q: 'Which boards are covered?', a: 'All BISE boards of Punjab, Sindh, Khyber Pakhtunkhwa, Balochistan and Azad Kashmir, the Federal Board (FBISE) and the Karachi boards BSEK (matric) and BIEK (inter).' },
    { q: 'Result kaise check karein?', a: "Open your board's page here, tap the official result link, choose your class and enter your roll number. Boards that publish an SMS code show it on their page." },
  ]
  const announced = boards.flatMap((b) => exTable(b, exams, year).filter((r) => r.e.status === 'announced').map((r) => ({ b, ...r })))
  return (
    <div className="pb-10">
      <JsonLd data={jsonLd(resultsPath(), `Board results ${year}`, [{ name: 'Home', url: '/' }, { name: 'Results', url: resultsPath() }], faqs)} />
      <PageHero
        title={`Board Results ${year} Pakistan: BISE, FBISE, BSEK, BIEK`}
        description="Result dates, official links, roll number and SMS checks for every board, updated when the board announces."
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Results' }]}
        icon={GraduationCap}
        color={COLOR}
        eyebrow="Results hub"
      />
      <div className="container-wide mt-8 max-w-[960px] space-y-10">
        {announced.length > 0 && (
          <section>
            <h2 className="font-display text-xl font-bold">Announced</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {announced.map((r) => (
                <li key={`${r.b.slug}-${r.c}`}>
                  <Link href={classPath(r.b.slug, r.c)} className="block rounded-xl border border-border px-4 py-3 hover:border-accent">
                    <span className="font-semibold">{r.b.name}</span> class {r.c}
                    <span className="block text-sm text-fg-muted">{r.text}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        {REGION_ORDER.map((region) => {
          const list = boards.filter((b) => b.region === region)
          if (!list.length) return null
          return (
            <section key={region}>
              <h2 className="font-display text-xl font-bold">{REGION_LABEL[region]} boards</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-[0.95rem]">
                  <thead>
                    <tr className="border-b border-border text-fg-muted">
                      <th className="py-2 pr-4">Board</th>
                      {CLASSES.map((c) => (
                        <th key={c} className="py-2 pr-4">
                          Class {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((b) => (
                      <tr key={b.slug} className="border-b border-border align-top">
                        <td className="py-2 pr-4 font-semibold">
                          <Link href={boardPath(b.slug)} className="hover:text-accent">
                            {b.name}
                          </Link>
                        </td>
                        {CLASSES.map((c) => (
                          <td key={c} className="py-2 pr-4 text-sm">
                            {b.classes.includes(c) ? (
                              <Link href={classPath(b.slug, c)} className="hover:text-accent">
                                {statusText(headlineExam(exams, b.slug, c, year))}
                              </Link>
                            ) : (
                              <span className="text-fg-subtle">-</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )
        })}
        {latest.length > 0 && (
          <section>
            <h2 className="font-display text-xl font-bold">Latest results and education news</h2>
            <ul className="mt-3 divide-y divide-border">
              {latest.map((n) => (
                <li key={n.id} className="py-2">
                  <Link href={n.href} className="font-semibold hover:text-accent">
                    {n.title}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm">
              <Link href="/education-jobs" className="font-bold underline">
                All education and jobs news
              </Link>
            </p>
          </section>
        )}
        <Warning />
        <FAQAccordion faqs={faqs} locale="en" />
      </div>
    </div>
  )
}

export function BoardPage({ board, exams, year, news, siblings }: { board: BoardView; exams: ExamView[]; year: number; news: NewsLink[]; siblings: BoardView[] }) {
  const updated = lastUpdated(board, exams)
  const faqs = boardFaqs(board, exams, year)
  const rows = exTable(board, exams, year)
  const holders = examsFor(exams, board.slug).filter((e) => e.positionHolders || e.gazetteUrl || e.passPercentage)
  return (
    <div className="pb-10">
      <JsonLd
        data={jsonLd(
          boardPath(board.slug),
          `${board.name} result ${year}`,
          [{ name: 'Home', url: '/' }, { name: 'Results', url: resultsPath() }, { name: board.name, url: boardPath(board.slug) }],
          faqs,
          updated,
        )}
      />
      <PageHero
        title={`${board.name} Result ${year}: Date, Roll Number and SMS Check`}
        description={`Official link, result dates for every class, how to check by roll number${board.smsCode ? ' or SMS' : ''}, gazette and position holders for ${board.name}.`}
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Results', href: resultsPath() }, { label: board.name }]}
        icon={GraduationCap}
        color={COLOR}
        eyebrow={`${board.city} · ${REGION_LABEL[board.region]}`}
      />
      <div className="container-wide mt-8 max-w-[860px] space-y-8">
        <OfficialLink board={board} />
        <section>
          <h2 className="font-display text-xl font-bold">Result dates {year}</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-[0.95rem]">
              <thead>
                <tr className="border-b border-border text-fg-muted">
                  <th className="py-2 pr-4">Class</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2">Source</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.c} className="border-b border-border align-top">
                    <td className="py-2 pr-4">
                      <Link href={classPath(board.slug, r.c)} className="font-semibold hover:text-accent">
                        {CLASS_LABEL[r.c]}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">
                      {r.text}
                      {r.e.id ? <span className="block text-xs text-fg-muted">{examTitle(r.e)}</span> : null}
                    </td>
                    <td className="py-2 text-sm">
                      <Sources e={r.e} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {updated && <p className="mt-3 text-sm text-fg-muted">Last updated: {dateLabel(updated)}. Dates are shown only with a source; if a board has not announced, we say so.</p>}
        </section>
        <section>
          <h2 className="font-display text-xl font-bold">How to check your {board.name} result</h2>
          <ol className="mt-3 list-decimal space-y-2 ps-6">
            <li>Keep your roll number slip or admit card ready.</li>
            <li>Open the official link above, choose your class and exam session.</li>
            <li>Type your roll number and submit. Save or print the page; your school receives the gazette too.</li>
          </ol>
          <p className="mt-4">
            <strong>By SMS:</strong>{' '}
            {board.smsCode ? (board.smsHowTo ?? `Send your roll number to ${board.smsCode}.`) : 'We have not verified a board SMS service for this board. We add the code here only when the board publishes one.'}
          </p>
          {board.gazetteUrl && (
            <p className="mt-2">
              <strong>Gazette:</strong>{' '}
              <a href={board.gazetteUrl} rel="noopener" className="underline">
                latest gazette on the board site
              </a>
            </p>
          )}
        </section>
        {holders.length > 0 && (
          <section>
            <h2 className="font-display text-xl font-bold">Gazette and position holders</h2>
            {holders.map((e) => (
              <div key={`${e.classLevel}-${e.session}-${e.year}`} className="mt-3 rounded-2xl border border-border p-4">
                <h3 className="font-bold">{examTitle(e)}</h3>
                {e.passPercentage && <p className="text-sm">Pass percentage: {e.passPercentage}</p>}
                {e.gazetteUrl && (
                  <p className="text-sm">
                    <a href={e.gazetteUrl} rel="noopener" className="underline">
                      Gazette
                    </a>
                  </p>
                )}
                {e.positionHolders && <p className="mt-2 whitespace-pre-line text-sm">{e.positionHolders}</p>}
              </div>
            ))}
          </section>
        )}
        {board.notes && <p className="whitespace-pre-line rounded-2xl bg-surface-2 p-4">{board.notes}</p>}
        <Warning />
        <NewsBlock items={news} title={`Latest ${board.name} news`} />
        <FAQAccordion faqs={faqs} locale="en" />
        <section>
          <h2 className="font-display text-lg font-bold">More boards in {REGION_LABEL[board.region]}</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {siblings
              .filter((s) => s.region === board.region && s.slug !== board.slug)
              .map((s) => (
                <li key={s.slug}>
                  <Link href={boardPath(s.slug)} className="chip">
                    {s.name}
                  </Link>
                </li>
              ))}
            <li>
              <Link href={resultsPath()} className="chip font-bold">
                All boards
              </Link>
            </li>
          </ul>
        </section>
      </div>
    </div>
  )
}

export function ClassPage({ board, classLevel, exams, year, news }: { board: BoardView; classLevel: ResultClass; exams: ExamView[]; year: number; news: NewsLink[] }) {
  const mine = examsFor(exams, board.slug, classLevel)
  const head = headlineExam(exams, board.slug, classLevel, year)
  const older = mine.filter((e) => e !== head)
  const faqs = classFaqs(board, classLevel, exams, year)
  const updated = lastUpdated(board, mine)
  const path = classPath(board.slug, classLevel)
  return (
    <div className="pb-10">
      <JsonLd
        data={jsonLd(
          path,
          `${board.name} class ${classLevel} result ${year}`,
          [{ name: 'Home', url: '/' }, { name: 'Results', url: resultsPath() }, { name: board.name, url: boardPath(board.slug) }, { name: `Class ${classLevel}`, url: path }],
          faqs,
          updated,
        )}
      />
      <PageHero
        title={`${board.name} Class ${classLevel} Result ${year}: Date and How to Check`}
        description={`${CLASS_LABEL[classLevel]}: result date, official link and roll number check for ${board.name}.`}
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Results', href: resultsPath() }, { label: board.name, href: boardPath(board.slug) }, { label: `Class ${classLevel}` }]}
        icon={GraduationCap}
        color={COLOR}
        eyebrow={examTitle(head)}
      />
      <div className="container-wide mt-8 max-w-[860px] space-y-8">
        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-sm font-semibold uppercase tracking-wide text-fg-muted">Result date</p>
          <p className="mt-1 font-display text-2xl font-bold">{statusText(head)}</p>
          {head.status !== 'not_announced' && (
            <p className="mt-1 text-sm">
              Source: <Sources e={head} />
            </p>
          )}
          {updated && <p className="mt-1 text-sm text-fg-muted">Last updated: {dateLabel(updated)}</p>}
        </div>
        <OfficialLink board={board} />
        {head.resultLink && (
          <p>
            <a href={head.resultLink} rel="noopener" className="font-bold underline">
              Direct link to this result
            </a>
          </p>
        )}
        <section>
          <h2 className="font-display text-xl font-bold">How to check</h2>
          <p className="mt-2">
            Open the official link, choose Class {classLevel}, enter your roll number.{' '}
            {board.smsCode ? (board.smsHowTo ?? `By SMS, send your roll number to ${board.smsCode}.`) : 'No board SMS service is verified for this board.'}
          </p>
        </section>
        {(head.positionHolders || head.gazetteUrl || head.passPercentage) && (
          <section>
            <h2 className="font-display text-xl font-bold">Gazette and position holders</h2>
            {head.passPercentage && <p className="mt-2">Pass percentage: {head.passPercentage}</p>}
            {head.gazetteUrl && (
              <p className="mt-2">
                <a href={head.gazetteUrl} rel="noopener" className="underline">
                  Gazette
                </a>
              </p>
            )}
            {head.positionHolders && <p className="mt-2 whitespace-pre-line">{head.positionHolders}</p>}
          </section>
        )}
        {older.length > 0 && (
          <section>
            <h2 className="font-display text-xl font-bold">Earlier exams</h2>
            <ul className="mt-2 space-y-1">
              {older.map((e) => (
                <li key={`${e.session}-${e.year}`}>
                  {examTitle(e)}: {statusText(e)}
                </li>
              ))}
            </ul>
          </section>
        )}
        <Warning />
        <NewsBlock items={news} title={`Latest ${board.name} news`} />
        <FAQAccordion faqs={faqs} locale="en" />
        <p className="text-sm">
          <Link href={boardPath(board.slug)} className="font-bold underline">
            All {board.name} results
          </Link>
          {' · '}
          <Link href={resultsPath()} className="font-bold underline">
            Results hub
          </Link>
        </p>
      </div>
    </div>
  )
}
