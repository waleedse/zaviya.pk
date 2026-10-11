import Image from 'next/image'
import Link from 'next/link'
import type { AuthorRef, Locale } from '@zaviya/shared'
import { localePath } from '@/lib/i18n'

export function AuthorAvatar({ author, size = 48 }: { author: AuthorRef; size?: number }) {
  const initials = author.name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  if (author.avatar?.url) {
    return (
      <span className="relative shrink-0 overflow-hidden rounded-full bg-surface-2" style={{ width: size, height: size }}>
        <Image src={author.avatar.url} alt="" fill className="object-cover" sizes={`${size}px`} />
      </span>
    )
  }
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-accent font-bold text-accent-fg"
      style={{ width: size, height: size, fontSize: size * 0.34 }}
      aria-hidden
    >
      {initials}
    </span>
  )
}

export function AuthorBox({ author, locale }: { author: AuthorRef & { bio?: string }; locale: Locale }) {
  const href = localePath(locale, `/author/${author.slug}`)
  return (
    <aside className="my-10 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-5 rounded-[22px] border border-border bg-surface p-5 md:p-6">
      <AuthorAvatar author={author} size={72} />
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href={href} className="font-display text-xl font-extrabold hover:text-accent">
              {author.name}
            </Link>
            {author.role && <p className="text-sm text-fg-subtle">{author.role}</p>}
          </div>
          <Link href={href} className="inline-flex h-10 items-center rounded-full border-[1.5px] border-accent px-4 text-sm font-extrabold text-accent hover:bg-accent hover:text-accent-fg">
            {locale === 'ur' ? 'مزید تحریریں' : 'More stories'}
          </Link>
        </div>
        {author.bio && <p className="text-[15px] leading-relaxed text-fg-muted">{author.bio}</p>}
      </div>
    </aside>
  )
}
