import { notFound } from 'next/navigation'
import { getStaticPage } from '@/lib/queries'
import { parseLocale } from '@/lib/locale'
import { aboutPageJsonLd, buildPageMetadata } from '@/lib/seo'
import { JsonLd } from '@/components/seo/JsonLd'
import { PageHero } from '@/components/layout/PageHero'
import { FileText } from 'lucide-react'
import { localePath, t } from '@/lib/i18n'
import { RichTextBody } from '@/components/article/RichTextBody'

export const revalidate = 300

// Render on first request, then serve from the ISR cache (without this Next 16 renders every request)
export async function generateStaticParams() {
  return []
}

const PAGE_DESCRIPTIONS: Record<string, [string, string]> = {
  about: ['Zaviya is a Pakistani digital newsroom explaining the stories that matter in clear English and Urdu, with every source listed.', 'زاویہ پاکستان کا ڈیجیٹل نیوز روم ہے جو اہم خبروں کو آسان اردو اور انگریزی میں ذرائع کے ساتھ پیش کرتا ہے۔'],
  'editorial-policy': ['How Zaviya selects, verifies, writes and corrects stories: our standards for sources, accuracy, fairness and sensitive topics.', 'زاویہ خبروں کا انتخاب، تصدیق، تحریر اور تصحیح کیسے کرتا ہے: ذرائع، درستگی اور حساس موضوعات کے ہمارے اصول۔'],
  'ai-policy': ['How Zaviya uses AI: drafting from cited sources, automated fact checks, labelled AI illustrations, and human oversight of sensitive stories.', 'زاویہ اے آئی کیسے استعمال کرتا ہے: درج ذرائع سے مسودہ، خودکار حقائق کی جانچ، اے آئی تصاویر پر واضح لیبل۔'],
  corrections: ['Zaviya corrects errors promptly and transparently. Read our corrections policy and how to report a mistake in any story.', 'زاویہ غلطیوں کی فوری اور واضح تصحیح کرتا ہے۔ ہماری تصحیح پالیسی اور غلطی کی نشاندہی کا طریقہ۔'],
  contact: ['Contact the Zaviya newsroom with story tips, corrections, partnership or advertising enquiries.', 'خبروں کی معلومات، تصحیح، شراکت داری یا اشتہارات کے لیے زاویہ نیوز روم سے رابطہ کریں۔'],
  privacy: ['Zaviya’s privacy policy: we use cookie-free, first-party analytics and never sell personal data.', 'زاویہ کی پرائیویسی پالیسی: ہم کوکی کے بغیر اینالیٹکس استعمال کرتے ہیں اور ذاتی ڈیٹا فروخت نہیں کرتے۔'],
  terms: ['Terms of use for Zaviya’s website, content and services, including copyright and acceptable use.', 'زاویہ کی ویب سائٹ، مواد اور خدمات کے استعمال کی شرائط، بشمول کاپی رائٹ۔'],
  advertise: ['Advertise with Zaviya and reach readers across Pakistan in English and Urdu. Contact us for options and rates.', 'زاویہ پر اشتہار دیں اور پاکستان بھر میں اردو اور انگریزی قارئین تک پہنچیں۔'],
}

function pageDescription(slug: string, title: string, locale: string): string {
  const d = PAGE_DESCRIPTIONS[slug]
  if (d) return locale === 'ur' ? d[1] : d[0]
  return `${title}: Zaviya, Pakistan news in English and Urdu.`
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale: l, slug } = await params
  const locale = parseLocale(l)
  const page = await getStaticPage(locale, slug)
  if (!page) return {}
  return buildPageMetadata({ locale, title: page.title, description: pageDescription(slug, page.title, locale), enPath: `/p/${slug}`, urPath: `/ur/p/${slug}` })
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
    <div className="pb-10">
      {slug === 'about' ? <JsonLd data={aboutPageJsonLd(locale)} /> : null}
      <PageHero
        title={page.title}
        crumbs={[{ label: d.nav.home, href: localePath(locale, '/') }, { label: page.title }]}
        icon={FileText}
        eyebrow={locale === 'ur' ? 'زاویہ' : 'Zaviya'}
      />
      <div className="container-wide pt-8">
        <div className="card-surface mx-auto max-w-3xl p-6 md:p-10">
          <div className="prose-article">
            <RichTextBody data={page.body ?? fallbackBody} />
          </div>
        </div>
      </div>
    </div>
  )
}
