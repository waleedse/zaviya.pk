import { Fragment } from 'react'
import type { Locale } from '@zaviya/shared'
import { AdSlot } from '@/components/ads/AdSlot'
import { WhatsAppCTA } from '@/components/marketing/WhatsAppCTA'
import { RichTextBody } from '@/components/article/RichTextBody'
import { splitLexicalAtBreakpoints } from '@/lib/lexical-split'

export function ArticleBodyWithAds({ data, locale }: { data: unknown; locale: Locale }) {
  const { segments, adAfterSegment } = splitLexicalAtBreakpoints(data, [3, 8])

  return (
    <>
      {segments.map((segment, i) => (
        <Fragment key={i}>
          <RichTextBody data={segment} />
          {i === 0 && adAfterSegment[0] ? <WhatsAppCTA locale={locale} compact inline /> : null}
          {adAfterSegment[i] ? <AdSlot locale={locale} size="rectangle" placement={`in-article-${i + 1}`} /> : null}
        </Fragment>
      ))}
    </>
  )
}
