import Link from 'next/link'
import { FAQAccordion } from '@/components/article/FAQAccordion'
import { BabyNamesExplorer, type Collection } from '@/components/names/BabyNamesExplorer'
import { JsonLd } from '@/components/seo/JsonLd'
import { parseLocale } from '@/lib/locale'
import { localePath } from '@/lib/i18n'
import { breadcrumbJsonLd, buildPageMetadata, faqJsonLd } from '@/lib/seo'
import { BABY_NAMES, trendingNames } from '@/lib/baby-names'

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ collection?: string }> }

const COLLECTION_KEYS: Collection[] = ['quranic', 'prophets', 'modern', 'turkish', 'regional', 'short']

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  return buildPageMetadata({
    locale,
    title: locale === 'ur' ? 'بچوں کے اسلامی نام اور ان کے معنی: لڑکوں اور لڑکیوں کے نام' : 'Muslim Baby Names with Meaning in Urdu: Boys & Girls Names 2026',
    description:
      locale === 'ur'
        ? 'لڑکوں اور لڑکیوں کے خوبصورت اسلامی نام، اردو املا اور معنی کے ساتھ۔ قرآنی نام، انبیاء کے نام، ترکی اور جدید نام۔'
        : 'Muslim names for boys and girls with Urdu spelling and meaning: Quranic, prophets’, modern and Turkish names. Shortlist and share on WhatsApp.',
    enPath: '/baby-names',
    urPath: '/ur/baby-names',
    absoluteTitle: true,
  })
}

export default async function BabyNamesPage({ params, searchParams }: Props) {
  const locale = parseLocale((await params).locale)
  const { collection } = await searchParams
  const isUr = locale === 'ur'
  const initial = COLLECTION_KEYS.find((c) => c === collection)
  const faqs = isUr
    ? [
        { q: 'بچے کا نام رکھتے وقت کیا دیکھنا چاہیے؟', a: 'اچھا معنی، آسان تلفظ، اور خاندان کی روایت۔ نام کا مطلب کسی عالم یا معتبر لغت سے تصدیق کر لیں۔' },
        { q: 'کیا یہ نام قرآن میں موجود ہیں؟', a: 'جن ناموں پر "قرآنی" لکھا ہے وہ خود یا ان کا لفظ قرآن مجید میں آیا ہے۔' },
      ]
    : [
        { q: 'What should I check before choosing a name?', a: 'A good meaning, easy pronunciation in Urdu and English, and how it sounds with the family name. Confirm the meaning with a scholar or a trusted dictionary.' },
        { q: 'What does “Quranic” mean on a name?', a: 'The name itself, or the word it comes from, appears in the Quran, such as Maryam, Noor, Huda and Hadi.' },
        { q: 'Which baby names are trending in Pakistan?', a: `Names popular with new parents include ${trendingNames(8).map((n) => n.name).join(', ')}.` },
        { q: 'Is my shortlist saved?', a: 'Your shortlist is kept in this browser only. Use “Send shortlist to family” to share it on WhatsApp.' },
      ]

  return (
    <div className="pb-10">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: isUr ? 'ہوم' : 'Home', url: localePath(locale, '/') },
            { name: isUr ? 'بچوں کے نام' : 'Baby names', url: localePath(locale, '/baby-names') },
          ]),
          faqJsonLd(faqs),
        ]}
      />
      <section className="border-b border-orange-100 bg-[#fff1e6] py-10 dark:border-border dark:bg-surface md:py-12">
        <div className="container-wide grid items-center gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            <nav aria-label="Breadcrumb" className="text-sm text-orange-800 dark:text-orange-300">
              <Link href={localePath(locale, '/')} className="hover:underline">
                {isUr ? 'ہوم' : 'Home'}
              </Link>{' '}
              › {isUr ? 'بچوں کے نام' : 'Baby names'}
            </nav>
            <p lang="ur" dir="rtl" className="self-start font-urdu-sans text-[22px] leading-[1.7] text-orange-900 dark:text-orange-300">
              بچوں کے خوبصورت اسلامی نام اور ان کے معنی
            </p>
            <h1 className="font-display text-[clamp(2.2rem,1.5rem+2.2vw,3.3rem)] font-extrabold leading-[1.04]">
              {isUr ? 'ایسا نام جو آپ کا بچہ ہمیشہ پسند کرے' : 'Find a name your child will love, with its meaning'}
            </h1>
            <p className="max-w-[58ch] text-lg text-orange-950/80 dark:text-fg-muted">
              {isUr
                ? 'اسلامی، اردو، فارسی اور ترکی نام، اردو املا اور معنی کے ساتھ۔ پسندیدہ نام محفوظ کریں اور واٹس ایپ پر شیئر کریں۔'
                : `${BABY_NAMES.length} Islamic, Urdu, Persian and Turkish names with Urdu spelling and origin. Shortlist your favourites and share them with family on WhatsApp.`}
            </p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- static decorative SVG */}
          <img src="/illustrations/baby.svg" alt="" width={800} height={450} className="hidden h-auto w-full rounded-[26px] lg:block" />
        </div>
      </section>

      <div className="container-wide mt-8 space-y-10">
        <BabyNamesExplorer locale={locale} names={BABY_NAMES} initialCollection={initial} />
        <div className="max-w-[860px]">
          <FAQAccordion faqs={faqs} locale={locale} />
        </div>
      </div>
    </div>
  )
}
