import { Skeleton } from '@/components/ui/skeleton'

export function HomeSkeleton() {
  return (
    <div className="container-page space-y-8 py-8">
      <Skeleton className="aspect-video w-full rounded-[var(--radius-image)]" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    </div>
  )
}

export function ArticleSkeleton() {
  return (
    <div className="container-page max-w-3xl space-y-4 py-8">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="aspect-video w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
    </div>
  )
}
