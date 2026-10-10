import { AngleMark } from '@/components/brand/Logo'

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <AngleMark className="mb-4 h-16 w-16 opacity-40" />
      <h2 className="font-display text-h2 font-semibold">{title}</h2>
      {description && <p className="mt-2 max-w-md text-fg-muted">{description}</p>}
    </div>
  )
}
