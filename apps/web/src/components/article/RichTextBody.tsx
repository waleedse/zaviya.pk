import { RichText } from '@payloadcms/richtext-lexical/react'
import { cn } from '@/lib/utils'

export function RichTextBody({ data, className }: { data: unknown; className?: string }) {
  if (!data) return null
  return (
    <div className={cn('prose-article [&_a]:text-accent [&_a]:underline-offset-2', className)}>
      <RichText data={data as never} />
    </div>
  )
}
