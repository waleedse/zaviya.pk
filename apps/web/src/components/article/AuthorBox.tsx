import Image from 'next/image'
import Link from 'next/link'
import type { AuthorRef, Locale } from '@zaviya/shared'
import { localePath } from '@/lib/i18n'

export function AuthorBox({ author, locale }: { author: AuthorRef & { bio?: string }; locale: Locale }) {
  return (
    <aside className="my-10 flex gap-4 rounded-[var(--radius-card)] border border-border bg-surface-2/50 p-6">
      {author.avatar?.url && (
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-surface-2">
          <Image src={author.avatar.url} alt={author.name} fill className="object-cover" sizes="64px" />
        </div>
      )}
      <div>
        <Link href={localePath(locale, `/author/${author.slug}`)} className="font-display text-lg font-semibold hover:text-accent">
          {author.name}
        </Link>
        {author.role && <p className="text-sm text-fg-muted">{author.role}</p>}
        {author.bio && <p className="mt-2 text-sm text-fg-muted">{author.bio}</p>}
      </div>
    </aside>
  )
}
