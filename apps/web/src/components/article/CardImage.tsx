import Image from 'next/image'
import type { ArticleCard, Locale } from '@zaviya/shared'
import { cn } from '@/lib/utils'

/**
 * Story image, or a designed placeholder in the category colour when a story has none
 * (never an empty grey box).
 */
export function CardImage({
  article,
  locale,
  sizes,
  priority,
  className,
  aspect = 'aspect-[16/10]',
  showLabel = true,
}: {
  article: ArticleCard
  locale: Locale
  sizes: string
  priority?: boolean
  className?: string
  aspect?: string
  showLabel?: boolean
}) {
  const img = article.image
  const color = article.category.color
  return (
    <div className={cn('relative overflow-hidden rounded-[var(--radius-image)] bg-surface-2', aspect, className)}>
      {img ? (
        <Image
          src={img.url}
          alt={img.alt}
          fill
          priority={priority}
          sizes={sizes}
          className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: `linear-gradient(135deg, ${color} 0%, color-mix(in oklab, ${color} 55%, #0c0f14) 100%)` }}
          aria-hidden
        >
          <svg className="absolute -bottom-6 end-[-8%] h-[120%] w-auto opacity-25" viewBox="0 0 100 100" fill="none">
            <path d="M10 95 L70 5" stroke="white" strokeWidth="14" strokeLinecap="round" />
            <path d="M45 95 L95 20" stroke="white" strokeWidth="5" strokeLinecap="round" opacity="0.6" />
          </svg>
          {showLabel ? (
            <span
              className={cn(
                'absolute bottom-3 start-3 text-white/90',
                locale === 'ur' ? 'font-display text-lg' : 'kicker-text text-[11px]',
              )}
            >
              {article.category.name}
            </span>
          ) : null}
        </div>
      )}
    </div>
  )
}
