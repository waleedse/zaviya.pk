import Link from 'next/link'
import { matchResultBoards, resultsPath } from '@/lib/result-boards'
import { matchVacationLinks } from '@/lib/vacations'

/** "Official link, date and SMS code" box for result stories, and winter-break / closure links for those stories (English articles). */
export function ArticleResultLinks({ title, dek }: { title: string; dek?: string }) {
  const text = `${title} ${dek ?? ''}`
  const boards = matchResultBoards(text)
  const others = matchVacationLinks(text)
  if (!boards.length && !others.length) return null
  return (
    <aside className="my-6 rounded-2xl border border-border bg-surface p-4 text-sm" aria-label="Related pages">
      {boards.length > 0 && (
        <>
          <p className="font-bold">Official link, date and how to check the result</p>
          <ul className="mt-2 space-y-1">
            {boards.map((m) => (
              <li key={m.href}>
                <Link href={m.href} className="font-semibold underline">
                  {m.board.name}
                  {m.classLevel ? ` class ${m.classLevel}` : ''} result: date, official link, roll number and SMS check
                </Link>
              </li>
            ))}
            <li>
              <Link href={resultsPath()} className="underline">
                All board results
              </Link>
            </li>
          </ul>
        </>
      )}
      {others.length > 0 && (
        <ul className={`${boards.length ? 'mt-3 ' : ''}space-y-1`}>
          {others.map((o) => (
            <li key={o.href}>
              <Link href={o.href} className="font-semibold underline">
                {o.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
