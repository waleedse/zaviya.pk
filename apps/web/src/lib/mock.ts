import {
  CATEGORIES,
  type ArticleCard,
  type ArticleFull,
  type CategoryRef,
  type CategorySlug,
  type DataPageFull,
  type DataPageKey,
  type Locale,
  type RateTick,
} from '@zaviya/shared'
import { DATA_PAGES } from '@zaviya/shared'

/** Development fixtures, used by lib/queries.ts when the database has no published articles. */

const HEADLINES: Record<CategorySlug, { en: string[]; ur: string[] }> = {
  pakistan: {
    en: [
      'Federal cabinet approves new relief package for flood-hit districts in Sindh',
      'NADRA launches same-day CNIC renewal in 40 more cities',
      'Karachi Green Line extension to Tower set for 2027 completion',
      'Punjab announces winter school timings from November 1',
    ],
    ur: [
      'وفاقی کابینہ نے سندھ کے سیلاب زدہ اضلاع کے لیے نئے امدادی پیکج کی منظوری دے دی',
      'نادرا نے مزید 40 شہروں میں اسی دن شناختی کارڈ کی تجدید شروع کر دی',
      'کراچی گرین لائن کی ٹاور تک توسیع 2027 میں مکمل ہوگی',
      'پنجاب میں یکم نومبر سے سکولوں کے سردیوں کے اوقات کا اعلان',
    ],
  },
  world: {
    en: [
      'Trump says US will "look closely" at expanding trade with Pakistan',
      'IMF board to review Pakistan programme next month, officials say',
      'Gulf states ease visa rules for Pakistani skilled workers',
    ],
    ur: [
      'ٹرمپ کا پاکستان کے ساتھ تجارت بڑھانے پر غور کرنے کا اعلان',
      'آئی ایم ایف بورڈ اگلے ماہ پاکستان پروگرام کا جائزہ لے گا',
      'خلیجی ممالک نے پاکستانی ہنرمندوں کے لیے ویزا قوانین نرم کر دیے',
    ],
  },
  business: {
    en: [
      'SBP cuts policy rate by 100bps to 10%, citing easing inflation',
      'Petrol price cut by Rs4.5 per litre for next fortnight',
      'PSX crosses 150,000 points for the first time',
      'Remittances hit record $3.4bn in September',
    ],
    ur: [
      'اسٹیٹ بینک نے شرح سود 100 بیسس پوائنٹس کم کر کے 10 فیصد کر دی',
      'پیٹرول کی قیمت میں 4.5 روپے فی لیٹر کمی',
      'پی ایس ایکس پہلی بار ڈیڑھ لاکھ پوائنٹس سے اوپر',
      'ستمبر میں ترسیلات زر ریکارڈ 3.4 ارب ڈالر تک پہنچ گئیں',
    ],
  },
  ai: {
    en: ['Pakistan drafts a national AI policy for public services', 'New AI models change how freelancers find work'],
    ur: ['پاکستان میں قومی اے آئی پالیسی کا مسودہ تیار', 'نئے اے آئی ماڈلز سے فری لانسرز کا کام بدل رہا ہے'],
  },
  'tech-telecom': {
    en: [
      'PTA begins 5G spectrum auction with three operators in the race',
      'Jazz, Zong roll out eSIM support for iPhone users nationwide',
      'Pakistan freelancers earned $500m in Q1, PSEB data shows',
    ],
    ur: [
      'پی ٹی اے نے فائیو جی اسپیکٹرم نیلامی کا آغاز کر دیا',
      'جاز اور زونگ نے آئی فون صارفین کے لیے ای سم سروس شروع کر دی',
      'پاکستانی فری لانسرز نے پہلی سہ ماہی میں 50 کروڑ ڈالر کمائے',
    ],
  },
  autos: {
    en: [
      'Toyota Corolla prices drop by up to Rs300,000 after duty cut',
      'BYD opens first Karachi assembly plant, local EVs from next year',
    ],
    ur: [
      'ڈیوٹی میں کمی کے بعد ٹویوٹا کرولا کی قیمت میں تین لاکھ روپے تک کمی',
      'بی وائی ڈی کا کراچی میں پہلا اسمبلی پلانٹ، اگلے سال سے مقامی الیکٹرک گاڑیاں',
    ],
  },
  cricket: {
    en: [
      'Babar Azam returns to Test squad for South Africa tour',
      'PCB announces PSL 12 schedule, opener in Lahore on Feb 14',
    ],
    ur: [
      'بابر اعظم جنوبی افریقہ کے دورے کے لیے ٹیسٹ اسکواڈ میں واپس',
      'پی سی بی نے پی ایس ایل 12 کا شیڈول جاری کر دیا، افتتاحی میچ لاہور میں',
    ],
  },
  'education-jobs': {
    en: [
      'BISE Lahore announces matric supplementary results date',
      'FPSC opens 1,200 posts in federal ministries, apply by Oct 30',
    ],
    ur: [
      'لاہور بورڈ نے میٹرک ضمنی امتحانات کے نتائج کی تاریخ کا اعلان کر دیا',
      'ایف پی ایس سی نے وفاقی وزارتوں میں 1200 آسامیاں مشتہر کر دیں',
    ],
  },
  trending: {
    en: [
      'Why everyone in Pakistan is talking about the new Rs5,000 note design',
      'Lahore smog season: what the AQI numbers really mean for your family',
    ],
    ur: [
      'پانچ ہزار کے نئے نوٹ کا ڈیزائن موضوع بحث کیوں بنا ہوا ہے',
      'لاہور میں اسموگ: اے کیو آئی کے اعداد و شمار آپ کے خاندان کے لیے کیا معنی رکھتے ہیں',
    ],
  },
}

const DEKS = {
  en: 'Here is what changed, why it matters, and what it means for households and businesses across Pakistan.',
  ur: 'کیا تبدیل ہوا، یہ کیوں اہم ہے، اور پاکستان بھر کے گھرانوں اور کاروبار کے لیے اس کا کیا مطلب ہے۔',
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80)
}

export function categoryRef(slug: CategorySlug, locale: Locale): CategoryRef {
  const c = CATEGORIES.find((x) => x.slug === slug)!
  return { slug: c.slug, name: locale === 'ur' ? c.ur : c.en, color: c.color }
}

export function articleHref(locale: Locale, category: string, slug: string): string {
  return locale === 'ur' ? `/ur/${category}/${slug}` : `/${category}/${slug}`
}

let cache: { en: ArticleCard[]; ur: ArticleCard[] } | null = null

function build(): { en: ArticleCard[]; ur: ArticleCard[] } {
  const base = Date.now()
  const out = { en: [] as ArticleCard[], ur: [] as ArticleCard[] }
  let i = 0
  for (const c of CATEGORIES) {
    const h = HEADLINES[c.slug]
    h.en.forEach((title, idx) => {
      const id = `mock-${c.slug}-${idx}`
      const slug = slugify(title)
      const publishedAt = new Date(base - i * 37 * 60_000).toISOString()
      const image = {
        url: `https://picsum.photos/seed/zaviya-${c.slug}-${idx}/1600/900`,
        alt: title,
        width: 1600,
        height: 900,
        credit: 'Picsum (placeholder)',
      }
      const common = {
        id,
        slug,
        image,
        publishedAt,
        readingTime: 3 + (i % 5),
        isLive: i === 2 || i === 9,
        isBreaking: i === 0,
        priority: i === 0 ? ('breaking' as const) : ('normal' as const),
        author: { slug: 'zaviya-desk', name: 'Zaviya Desk', role: 'Newsroom' },
      }
      out.en.push({
        ...common,
        locale: 'en',
        href: articleHref('en', c.slug, slug),
        alternateHref: articleHref('ur', c.slug, slug),
        title,
        dek: DEKS.en,
        category: categoryRef(c.slug, 'en'),
      })
      out.ur.push({
        ...common,
        locale: 'ur',
        href: articleHref('ur', c.slug, slug),
        alternateHref: articleHref('en', c.slug, slug),
        title: h.ur[idx] ?? title,
        dek: DEKS.ur,
        category: categoryRef(c.slug, 'ur'),
        author: { slug: 'zaviya-desk', name: 'زاویہ ڈیسک', role: 'نیوز روم' },
      })
      i++
    })
  }
  for (const l of ['en', 'ur'] as const) out[l].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  return out
}

export function mockCards(locale: Locale): ArticleCard[] {
  cache ??= build()
  return cache[locale]
}

function lexicalParagraphs(paragraphs: string[]): unknown {
  return {
    root: {
      type: 'root',
      version: 1,
      direction: 'ltr',
      format: '',
      indent: 0,
      children: paragraphs.map((text) => ({
        type: 'paragraph',
        version: 1,
        direction: 'ltr',
        format: '',
        indent: 0,
        textFormat: 0,
        children: [{ type: 'text', version: 1, text, format: 0, detail: 0, mode: 'normal', style: '' }],
      })),
    },
  }
}

export function mockArticle(card: ArticleCard): ArticleFull {
  const ur = card.locale === 'ur'
  const p = ur
    ? [
        'حکومت نے جمعہ کو اس فیصلے کا اعلان کیا جس کا اطلاق فوری طور پر ہوگا۔ حکام کے مطابق اس اقدام کا مقصد عام شہریوں کو ریلیف فراہم کرنا ہے۔',
        'ماہرین کا کہنا ہے کہ اس فیصلے کے اثرات آنے والے ہفتوں میں واضح ہوں گے، خاص طور پر متوسط طبقے کے گھرانوں پر۔',
        'گزشتہ تین ماہ میں یہ اس نوعیت کا دوسرا اعلان ہے۔ اس سے قبل اگست میں بھی اسی طرح کا اقدام کیا گیا تھا۔',
      ]
    : [
        'The government announced the decision on Friday, saying it would take effect immediately. Officials said the move is aimed at providing relief to ordinary citizens amid rising living costs.',
        'Analysts say the impact will become clearer over the coming weeks, particularly for middle-income households that have borne the brunt of recent price increases.',
        'This is the second such announcement in three months. A similar step was taken in August, when the government revised rates following consultations with stakeholders.',
        'Opposition lawmakers welcomed the decision but questioned whether it would be sustained beyond the current fiscal year.',
      ]
  return {
    ...card,
    author: { ...(card.author ?? { slug: 'zaviya-desk', name: 'Zaviya Desk' }), bio: ur ? 'زاویہ کا نیوز روم۔' : 'The Zaviya newsroom, AI-assisted and human-reviewed.' },
    body: lexicalParagraphs(p),
    whatItMeans: lexicalParagraphs([
      ur
        ? 'اگر آپ ماہانہ 100 لیٹر پیٹرول استعمال کرتے ہیں تو آپ کو تقریباً 450 روپے کی بچت ہوگی۔'
        : 'If you use around 100 litres of petrol a month, you will save roughly Rs450. Transport fares may follow within two weeks.',
    ]),
    keyPoints: ur
      ? ['فیصلے کا اطلاق فوری طور پر ہوگا', 'متوسط طبقے کو سب سے زیادہ فائدہ', 'تین ماہ میں دوسرا اعلان']
      : ['Takes effect immediately', 'Middle-income households benefit most', 'Second such move in three months'],
    faqs: ur
      ? [{ q: 'یہ فیصلہ کب سے نافذ ہوگا؟', a: 'فوری طور پر۔' }]
      : [
          { q: 'When does this take effect?', a: 'Immediately, from the date of the notification.' },
          { q: 'petrol kab sasta hoga?', a: 'The next review is due on the 15th of the month.' },
        ],
    sources: [
      { name: 'Finance Division', url: 'https://www.finance.gov.pk', tier: 1 },
      { name: 'Dawn', url: 'https://www.dawn.com', tier: 2 },
    ],
    embeds: [],
    tags: [{ slug: 'economy', name: ur ? 'معیشت' : 'Economy' }],
    updates: card.isLive
      ? [
          { at: new Date(Date.now() - 5 * 60_000).toISOString(), text: ur ? 'وزیر خزانہ کی پریس کانفرنس جاری ہے۔' : 'Finance minister is addressing a press conference.' },
          { at: new Date(Date.now() - 40 * 60_000).toISOString(), text: ur ? 'نوٹیفکیشن جاری کر دیا گیا۔' : 'Official notification issued.' },
        ]
      : [],
    corrections: [],
    seo: {},
  }
}

function spark(base: number, n = 14, vol = 0.01): number[] {
  const out: number[] = []
  let v = base
  for (let i = 0; i < n; i++) {
    v = v * (1 + (Math.sin(i * 1.7 + base) * vol) / 2)
    out.push(Math.round(v * 100) / 100)
  }
  return out
}

export function mockRates(): RateTick[] {
  const now = new Date().toISOString()
  return [
    { series: 'gold_24k_tola', label: 'Gold 24K / tola', value: 412500, unit: 'PKR', change: 1500, changePct: 0.36, observedAt: now, href: '/gold-rate-today-pakistan', spark: spark(410000) },
    { series: 'usd_interbank', label: 'USD interbank', value: 281.42, unit: 'PKR', change: -0.18, changePct: -0.06, observedAt: now, href: '/dollar-rate-today-pakistan', spark: spark(281.6, 14, 0.002) },
    { series: 'usd_open_sell', label: 'USD open market', value: 283.1, unit: 'PKR', change: 0.1, changePct: 0.04, observedAt: now, href: '/dollar-rate-today-pakistan', spark: spark(283, 14, 0.002) },
    { series: 'petrol_super', label: 'Petrol / litre', value: 254.63, unit: 'PKR', change: -4.5, changePct: -1.74, observedAt: now, href: '/petrol-price-today-pakistan', spark: spark(259, 14, 0.004) },
  ]
}

export function mockDataPage(locale: Locale, key: DataPageKey): DataPageFull {
  const def = DATA_PAGES.find((d) => d.key === key)!
  const rates = mockRates()
  const headline = key === 'gold' ? rates[0] : key === 'usd-pkr' ? rates[1] : rates[3]
  const days = 30
  const points = Array.from({ length: days }, (_, i) => ({
    t: new Date(Date.now() - (days - i) * 86_400_000).toISOString(),
    v: Math.round(headline.value * (1 + Math.sin(i / 3) * 0.01) * 100) / 100,
  }))
  const table =
    key === 'gold'
      ? [
          { label: '24K', values: { tola: 412500, '10g': 353650, gram: 35365 } },
          { label: '22K', values: { tola: 378125, '10g': 324180, gram: 32418 } },
          { label: '21K', values: { tola: 360940, '10g': 309450, gram: 30945 } },
          { label: '18K', values: { tola: 309375, '10g': 265240, gram: 26524 } },
        ]
      : key === 'usd-pkr'
        ? [
            { label: 'Interbank', values: { buy: 281.32, sell: 281.42 } },
            { label: 'Open market', values: { buy: 282.6, sell: 283.1 } },
          ]
        : [
            { label: 'Petrol (Super)', values: { price: 254.63, change: -4.5 } },
            { label: 'High Speed Diesel', values: { price: 258.64, change: -2.0 } },
            { label: 'Kerosene', values: { price: 176.37, change: 0 } },
          ]
  return {
    key,
    slug: def.slug,
    title: locale === 'ur' ? def.ur : def.en,
    intro:
      locale === 'ur'
        ? 'یہ صفحہ تازہ ترین سرکاری اور مارکیٹ ریٹس کے ساتھ خود بخود اپ ڈیٹ ہوتا ہے۔'
        : 'This page updates automatically with the latest official and market rates.',
    faqs: [
      { q: locale === 'ur' ? 'ریٹ کب اپ ڈیٹ ہوتا ہے؟' : 'How often is this updated?', a: locale === 'ur' ? 'دن میں کئی بار۔' : 'Several times a day, as soon as the source publishes.' },
      { q: 'aaj ka rate kya hai?', a: `${headline.value.toLocaleString('en-PK')} ${headline.unit}` },
    ],
    updatedAt: headline.observedAt,
    source: key === 'gold' ? 'All Pakistan Sarafa Gems & Jewellers Association' : key === 'usd-pkr' ? 'State Bank of Pakistan / Forex Association of Pakistan' : 'OGRA / Finance Division',
    headline,
    table,
    history: [{ series: headline.series, points }],
    cities: key === 'gold' ? ['karachi', 'lahore', 'islamabad', 'peshawar', 'quetta'].map((city) => ({ city, values: { '24K': 412500, '22K': 378125 } })) : undefined,
    related: mockCards(locale).filter((a) => a.category.slug === 'business').slice(0, 4),
  }
}
