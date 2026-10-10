import { notFound } from 'next/navigation'
import { getStaticPage } from '@/lib/queries'
import { parseLocale } from '@/lib/locale'
import { buildPageMetadata } from '@/lib/seo'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import { localePath, t } from '@/lib/i18n'
import { RichTextBody } from '@/components/article/RichTextBody'

export const revalidate = 300

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale: l, slug } = await params
  const locale = parseLocale(l)
  const page = await getStaticPage(locale, slug)
  if (!page) return {}
  return buildPageMetadata({ locale, title: page.title, path: `/p/${slug}`, urPath: `/ur/p/${slug}` })
}

export default async function StaticPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale: l, slug } = await params
  const locale = parseLocale(l)
  const page = await getStaticPage(locale, slug)
  if (!page) notFound()
  const d = t(locale)

  const fallbackBody = {
    root: {
      type: 'root',
      version: 1,
      direction: locale === 'ur' ? 'rtl' : 'ltr',
      format: '',
      indent: 0,
      children: [
        {
          type: 'paragraph',
          version: 1,
          children: [
            {
              type: 'text',
              version: 1,
              text:
                locale === 'ur'
                  ? 'یہ صفحہ زاویہ کی پالیسیوں اور رہنما اصولوں کے لیے ہے۔ مکمل متن جلد شائع ہوگا۔'
                  : 'This page outlines Zaviya policies and editorial standards. Full text will be published here soon.',
              format: 0,
              detail: 0,
              mode: 'normal',
              style: '',
            },
          ],
        },
      ],
    },
  }

  return (
    <div className="container-page max-w-3xl py-12">
      <Breadcrumbs items={[{ label: d.nav.home, href: localePath(locale, '/') }, { label: page.title }]} />
      <h1 className="font-display text-h1 font-semibold">{page.title}</h1>
      <div className="mt-8">
        <RichTextBody data={page.body ?? fallbackBody} />
      </div>
    </div>
  )
}
