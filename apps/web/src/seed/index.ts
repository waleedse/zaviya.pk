import { convertMarkdownToLexical, editorConfigFactory } from '@payloadcms/richtext-lexical'
import { getPayload } from 'payload'
import config from '@payload-config'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { CATEGORIES, DATA_PAGES, SITE } from '@zaviya/shared'
import { SEED_SOURCES } from './sources'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function upsertUser(
  payload: Awaited<ReturnType<typeof getPayload>>,
  email: string,
  password: string,
  role: 'admin' | 'editor' | 'bot',
  enableAPIKey = false,
): Promise<{ user: Awaited<ReturnType<typeof payload.create>>; apiKey?: string }> {
  const existing = await payload.find({
    collection: 'users',
    where: { email: { equals: email } },
    limit: 1,
    overrideAccess: true,
  })
  let apiKey: string | undefined
  if (enableAPIKey) {
    apiKey = `zaviya_${crypto.randomBytes(24).toString('hex')}`
  }
  if (existing.docs[0]) {
    const user = await payload.update({
      collection: 'users',
      id: existing.docs[0].id,
      data: {
        role,
        ...(enableAPIKey ? { enableAPIKey: true, apiKey } : {}),
      },
      overrideAccess: true,
    })
    return { user, apiKey }
  }
  const user = await payload.create({
    collection: 'users',
    data: { email, password, role, enableAPIKey, ...(apiKey ? { apiKey } : {}) },
    overrideAccess: true,
  })
  return { user, apiKey }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function heroPlaceholderSvg(title: string, accent: string, locale: 'en' | 'ur'): Buffer {
  const dir = locale === 'ur' ? 'rtl' : 'ltr'
  const brand = locale === 'ur' ? SITE.nameUr : SITE.name
  const label = locale === 'ur' ? 'AI سے تیار کردہ پلیس ہولڈر' : 'AI-generated placeholder'
  const safeTitle = escapeXml(title)
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0b0f17"/>
      <stop offset="55%" stop-color="#1a2133"/>
      <stop offset="100%" stop-color="#121826"/>
    </linearGradient>
  </defs>
  <rect width="1600" height="900" fill="url(#bg)"/>
  <rect width="1600" height="10" fill="${accent}"/>
  <circle cx="1450" cy="780" r="220" fill="${accent}" opacity="0.12"/>
  <text x="80" y="120" fill="#ecedee" font-family="Georgia, serif" font-size="42" font-weight="700">${escapeXml(brand)}</text>
  <text x="80" y="420" fill="#ecedee" font-family="Georgia, serif" font-size="56" font-weight="700" direction="${dir}">${safeTitle}</text>
  <text x="80" y="820" fill="#b8902b" font-family="Georgia, serif" font-size="22">${escapeXml(label)}</text>
</svg>`
  return Buffer.from(svg, 'utf8')
}

async function upsertHeroMedia(
  payload: Awaited<ReturnType<typeof getPayload>>,
  slug: string,
  title: string,
  accent: string,
): Promise<number | undefined> {
  const filename = `seed-hero-${slug}.svg`
  const existing = await payload.find({
    collection: 'media',
    where: { filename: { equals: filename } },
    limit: 1,
    overrideAccess: true,
  })
  if (existing.docs[0]?.id) return existing.docs[0].id as number

  const file = heroPlaceholderSvg(title, accent, 'en')
  const doc = await payload.create({
    collection: 'media',
    data: {
      alt: title,
      credit: 'Zaviya',
      license: 'ai-generated',
      isAiGenerated: true,
    },
    file: {
      data: file,
      mimetype: 'image/svg+xml',
      name: filename,
      size: file.length,
    },
    overrideAccess: true,
  })
  return doc.id as number
}

function writeWorkerEnv(apiKey: string) {
  // apps/web/src/seed → apps/worker/.env
  const workerEnv = path.resolve(__dirname, '../../../worker/.env')
  let content = fs.existsSync(workerEnv) ? fs.readFileSync(workerEnv, 'utf8') : ''
  const set = (key: string, value: string) => {
    const re = new RegExp(`^${key}=.*$`, 'm')
    const line = `${key}=${value}`
    content = re.test(content) ? content.replace(re, line) : `${content.trimEnd()}\n${line}\n`
  }
  set('PAYLOAD_API_KEY', apiKey)
  set('PAYLOAD_URL', process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3100')
  fs.mkdirSync(path.dirname(workerEnv), { recursive: true })
  fs.writeFileSync(workerEnv, content)
}

async function seed() {
  const payload = await getPayload({ config })
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@zaviya.pk'
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'change-me-now-123'

  await upsertUser(payload, adminEmail, adminPassword, 'admin')
  const { apiKey } = await upsertUser(payload, 'bot@zaviya.pk', `bot-${Date.now()}`, 'bot', true)

  for (const c of CATEGORIES) {
    const found = await payload.find({
      collection: 'categories',
      where: { slug: { equals: c.slug } },
      limit: 1,
    })
    const data = {
      slug: c.slug,
      color: c.color,
      order: CATEGORIES.indexOf(c),
      showInNav: true,
      name: c.en,
    }
    if (found.docs[0]) {
      await payload.update({
        collection: 'categories',
        id: found.docs[0].id,
        locale: 'en',
        data: { name: c.en, description: `${c.en} news from Zaviya` },
      })
      await payload.update({
        collection: 'categories',
        id: found.docs[0].id,
        locale: 'ur',
        data: { name: c.ur },
      })
    } else {
      const doc = await payload.create({
        collection: 'categories',
        locale: 'en',
        data: { ...data, name: c.en, description: `${c.en} news from Zaviya` },
      })
      await payload.update({
        collection: 'categories',
        id: doc.id,
        locale: 'ur',
        data: { name: c.ur },
      })
    }
  }

  const authorFound = await payload.find({
    collection: 'authors',
    where: { slug: { equals: 'zaviya-desk' } },
    limit: 1,
  })
  let authorId = authorFound.docs[0]?.id
  if (!authorId) {
    const a = await payload.create({
      collection: 'authors',
      data: {
        name: 'Zaviya Desk',
        slug: 'zaviya-desk',
        role: 'Newsroom',
      },
    })
    authorId = a.id
    await payload.update({
      collection: 'authors',
      id: authorId,
      locale: 'ur',
      data: {
        bio: 'زاویہ کا مرکزی نیوز روم۔ خبریں AI سے تیار، انسانی ایڈیٹرز سے تصدیق شدہ۔',
      },
    })
    await payload.update({
      collection: 'authors',
      id: authorId,
      locale: 'en',
      data: {
        bio: 'The Zaviya newsroom. Stories are AI-assisted and human-reviewed before publication.',
      },
    })
  }

  const staticPages: { slug: string; enTitle: string; urTitle: string; en: string; ur: string }[] = [
    {
      slug: 'about',
      enTitle: 'About Zaviya',
      urTitle: 'زاویہ کے بارے میں',
      en: 'Zaviya (زاویہ) is a Pakistani digital newsroom built for clarity in English and Urdu.\n\nWe cover politics, economy, technology, sports and everyday life with verified sources and transparent corrections.\n\nOur team combines automated monitoring with human editors who approve every story before it goes live.',
      ur: 'زاویہ (Zaviya) پاکستان کی دو لسانی ڈیجیٹل نیوز روم ہے جو انگریزی اور اردو میں واضح رپورٹنگ پیش کرتی ہے۔\n\nہم سیاست، معیشت، ٹیکنالوجی، کھیل اور روزمرہ زندگی کو مستند ذرائع کے ساتھ کور کرتے ہیں۔\n\nخودکار نگرانی اور انسانی ایڈیٹورز مل کر ہر خبر کو شائع ہونے سے پہلے چیک کرتے ہیں۔',
    },
    {
      slug: 'editorial-policy',
      enTitle: 'Editorial Policy',
      urTitle: 'اداریہ پالیسی',
      en: 'Zaviya follows standard newsroom ethics: accuracy first, fairness, and timely corrections.\n\nWe label AI-assisted content clearly and never publish unverified claims about minors, ongoing investigations, or sensitive national security matters without senior review.\n\nReaders can contact the desk for factual disputes at corrections@zaviya.pk.',
      ur: 'زاویہ معیاری نیوز روم اصولوں پر عمل کرتی ہے: درستگی، توازن اور بروقت تصحیحات۔\n\nAI سے مدد یافتہ مواد کو واضح لیبل کیا جاتا ہے۔ غیر تصدیق شدہ دعوے، خاص طور پر بچوں یا حساس معاملات پر، سینئر ریویو کے بغیر شائع نہیں ہوتے۔',
    },
    {
      slug: 'ai-policy',
      enTitle: 'How We Use AI',
      urTitle: 'AI کا استعمال',
      en: 'Zaviya uses AI to monitor hundreds of sources, cluster related reports, draft structured story outlines, and suggest headlines — but **no story is published automatically**.\n\nEvery article is written to a strict JSON schema, checked against source text for numbers and names, and approved by a human editor.\n\nWe disclose AI assistance on each article page, link primary sources, and publish corrections prominently when we err.',
      ur: 'زاویہ AI کو سینکڑوں ذرائع کی نگرانی، متعلقہ خبروں کا گروپ بنانا، ڈرافٹ تیار کرنا اور عنوانات تجویز کرنے کے لیے استعمال کرتی ہے — مگر **کوئی خبر خودکار طور پر شائع نہیں ہوتی**۔\n\nہر مضمون مخصوص JSON فارمیٹ میں لکھا جاتا ہے، اعداد و حروف ذرائع سے ملائے جاتے ہیں، اور انسانی ایڈیٹر منظوری دیتا ہے۔\n\nہر صفحے پر AI مدد، ماخذ اور تصحیحات واضح ہیں۔',
    },
    {
      slug: 'corrections',
      enTitle: 'Corrections Policy',
      urTitle: 'تصحیحات کی پالیسی',
      en: 'When we get something wrong, we fix the article, note the change with a timestamp, and explain what changed.\n\nMajor corrections may include an editor\'s note at the top of the story.\n\nEmail corrections@zaviya.pk with links and evidence.',
      ur: 'غلطی کی صورت میں ہم مضمون درست کرتے ہیں، وقت کے ساتھ نوٹ شامل کرتے ہیں، اور وضاحت کرتے ہیں کہ کیا بدلا۔\n\nبڑی غلطیوں پر ایڈیٹر نوٹ شامل ہو سکتا ہے۔\n\ncorrections@zaviya.pk پر رابطہ کریں۔',
    },
    {
      slug: 'privacy',
      enTitle: 'Privacy Policy',
      urTitle: 'رازداری کی پالیسی',
      en: 'We use cookies for basic analytics, ad delivery (Google AdSense when enabled), and to remember language preferences.\n\nWe do not sell personal data. Server logs are retained for security up to 30 days.\n\nContact privacy@zaviya.pk for data requests.',
      ur: 'ہم بنیادی تجزیات، اشتہارات (Google AdSense جب فعال ہو) اور زبان کی ترجیح کے لیے کوکیز استعمال کرتے ہیں۔\n\nذاتی ڈیٹا فروخت نہیں ہوتا۔ سیکیورٹی لاگز 30 دن تک محفوظ رہتے ہیں۔',
    },
    {
      slug: 'terms',
      enTitle: 'Terms of Use',
      urTitle: 'شرائط استعمال',
      en: 'By using zaviya.pk you agree not to scrape at scale, republish full articles without permission, or attempt to disrupt our services.\n\nContent is © Zaviya unless otherwise credited.',
      ur: 'zaviya.pk استعمال کرتے ہوئے آپ بڑے پیمانے پر سکریپنگ، بغیر اجازت مکمل دوبارہ اشاعت، یا سروس میں خلل سے گریز کریں گے۔',
    },
    {
      slug: 'contact',
      enTitle: 'Contact Us',
      urTitle: 'رابطہ',
      en: 'Newsroom: desk@zaviya.pk\nAdvertising: ads@zaviya.pk\nLegal: legal@zaviya.pk\nKarachi, Pakistan.',
      ur: 'نیوز روم: desk@zaviya.pk\nاشتہارات: ads@zaviya.pk\nکراچی، پاکستان۔',
    },
    {
      slug: 'advertise',
      enTitle: 'Advertise with Zaviya',
      urTitle: 'زاویہ پر اشتہار دیں',
      en: 'Reach bilingual audiences across Pakistan with display and sponsored content.\n\nDownload our media kit at ads@zaviya.pk.',
      ur: 'پاکستان بھر میں دو لسانی سامعین تک پہنچیں۔\n\nads@zaviya.pk پر میڈیا کٹ حاصل کریں۔',
    },
  ]

  const editorConfig = await editorConfigFactory.default({ config: payload.config })
  const md = (s: string) => convertMarkdownToLexical({ editorConfig, markdown: s })

  for (const p of staticPages) {
    const found = await payload.find({
      collection: 'pages',
      where: { slug: { equals: p.slug } },
      limit: 1,
    })
    if (found.docs[0]) {
      await payload.update({
        collection: 'pages',
        id: found.docs[0].id,
        locale: 'en',
        data: { title: p.enTitle, body: md(p.en) },
      })
      await payload.update({
        collection: 'pages',
        id: found.docs[0].id,
        locale: 'ur',
        data: { title: p.urTitle, body: md(p.ur) },
      })
    } else {
      const doc = await payload.create({
        collection: 'pages',
        locale: 'en',
        data: { slug: p.slug, title: p.enTitle, body: md(p.en) },
      })
      await payload.update({
        collection: 'pages',
        id: doc.id,
        locale: 'ur',
        data: { title: p.urTitle, body: md(p.ur) },
      })
    }
  }

  for (const dp of DATA_PAGES) {
    const found = await payload.find({
      collection: 'data-pages',
      where: { key: { equals: dp.key } },
      limit: 1,
    })
    const faqsEn =
      dp.key === 'gold'
        ? [
            { q: 'How often is the gold rate updated?', a: 'Several times daily from sarafa and market sources.' },
            { q: 'aaj sone ka rate kya hai?', a: 'See the headline rate above — updated when sources publish.' },
          ]
        : dp.key === 'usd-pkr'
          ? [
              { q: 'What is the difference between interbank and open market?', a: 'Interbank is for banks; open market is what exchange companies quote.' },
              { q: 'aaj dollar ka rate kya hai?', a: 'Check interbank and open market rows on this page.' },
            ]
          : [
              { q: 'When does OGRA notify new petrol prices?', a: 'Usually on the 1st and 16th of each month, unless interim changes are announced.' },
              { q: 'aaj petrol price kya hai?', a: 'Super petrol per-litre rate is shown in the headline.' },
            ]
    const faqsUr =
      dp.key === 'gold'
        ? [{ q: 'سونے کا ریٹ کب اپ ڈیٹ ہوتا ہے؟', a: 'دن میں کئی بار۔' }]
        : dp.key === 'usd-pkr'
          ? [{ q: 'انٹربینک اور اوپن مارکیٹ میں کیا فرق ہے؟', a: 'انٹربینک بینکوں کے لیے، اوپن مارکیٹ ایکسچینج کمپنیوں کا ریٹ ہے۔' }]
          : [{ q: 'OGRA نئی قیمتیں کب جاری کرتا ہے؟', a: 'عام طور پر ہر ماہ کی 1 اور 16 تاریخ کو۔' }]

    const data = {
      key: dp.key,
      title: dp.en,
      slug: dp.slug,
      intro: 'Rates on this page are aggregated from official and market sources for informational purposes.',
      faqs: faqsEn,
      latestSnapshot: {},
      updatedAt: new Date().toISOString(),
    }
    if (found.docs[0]) {
      await payload.update({ collection: 'data-pages', id: found.docs[0].id, data })
      await payload.update({
        collection: 'data-pages',
        id: found.docs[0].id,
        locale: 'ur',
        data: { intro: 'یہ صفحہ سرکاری اور مارکیٹ ذرائع سے ریٹس اکٹھا کرتا ہے۔', faqs: faqsUr },
      })
    } else {
      const doc = await payload.create({ collection: 'data-pages', data })
      await payload.update({
        collection: 'data-pages',
        id: doc.id,
        locale: 'ur',
        data: { intro: 'یہ صفحہ سرکاری اور مارکیٹ ذرائع سے ریٹس اکٹھا کرتا ہے۔', faqs: faqsUr },
      })
    }
  }

  await payload.updateGlobal({
    slug: 'settings',
    data: {
      thresholds: { publish: 0.72, review: 0.5 },
      dailyCaps: { facebook: 15, instagram: 8, x: 12 },
      publishWindow: { start: '08:00', end: '00:00' },
      minIntervalMin: 45,
      activeModels: {
        triage: 'ollama:qwen3:4b',
        write_en: 'ollama:qwen3:8b',
        write_ur: 'ollama:qalb:8b-q4',
        qa: 'ollama:qwen3:4b',
        embed: 'ollama:nomic-embed-text',
      },
      killSwitch: false,
    },
    overrideAccess: true,
  })

  for (const s of SEED_SOURCES) {
    const found = await payload.find({
      collection: 'sources',
      where: { key: { equals: s.key } },
      limit: 1,
    })
    const data = { ...s, enabled: true, robotsOk: true }
    if (found.docs[0]) {
      await payload.update({ collection: 'sources', id: found.docs[0].id, data })
    } else {
      await payload.create({ collection: 'sources', data })
    }
  }

  const promptKeys = ['triage', 'write_en', 'write_ur', 'qa', 'social_copy'] as const
  for (const key of promptKeys) {
    const found = await payload.find({
      collection: 'prompt-versions',
      where: { and: [{ key: { equals: key } }, { version: { equals: 1 } }] },
      limit: 1,
    })
    if (!found.docs[0]) {
      await payload.create({
        collection: 'prompt-versions',
        data: {
          key,
          version: 1,
          template: 'see apps/worker/src/prompts',
          active: true,
        },
      })
    }
  }

  const seriesSeed = [
    { series: 'gold_24k_tola' as const, base: 412500, unit: 'PKR', source: 'APSGJA' },
    { series: 'usd_interbank' as const, base: 281.4, unit: 'PKR', source: 'SBP' },
    { series: 'usd_open_sell' as const, base: 283.1, unit: 'PKR', source: 'FAP' },
    { series: 'petrol_super' as const, base: 254.6, unit: 'PKR', source: 'OGRA' },
  ]
  for (const s of seriesSeed) {
    for (let d = 0; d < 30; d++) {
      const observedAt = new Date(Date.now() - d * 86_400_000).toISOString()
      const jitter = 1 + Math.sin(d / 4) * 0.008
      const value = Math.round(s.base * jitter * (s.series.includes('usd') ? 1000 : 1)) / (s.series.includes('usd') ? 1000 : 1)
      const dup = await payload.find({
        collection: 'data-points',
        where: {
          and: [{ series: { equals: s.series } }, { observedAt: { equals: observedAt } }],
        },
        limit: 1,
      })
      if (!dup.docs[0]) {
        await payload.create({
          collection: 'data-points',
          data: {
            series: s.series,
            value,
            unit: s.unit,
            source: s.source,
            observedAt,
          },
        })
      }
    }
  }

  const sampleArticles = [
    {
      slug: 'sbp-cuts-policy-rate-october-2026',
      category: 'business',
      en: {
        title: 'SBP cuts policy rate by 100bps as inflation eases',
        slug: 'sbp-cuts-policy-rate-october-2026',
        dek: 'The central bank lowered the benchmark to 10% citing softer food prices and stable FX reserves, in a move analysts say will ease borrowing costs for households.',
        body: 'The State Bank of Pakistan reduced the policy rate by 100 basis points to **10%** on Friday, marking the second cut this quarter.\n\nGovernor notes said headline inflation has trended down while remittances remain strong.\n\nBanks are expected to pass on lower rates to consumer loans over the next two months.',
        urSlug: 'sbp-ne-sarmaya-kari-sharah-kam-kardi',
        urTitle: 'اسٹیٹ بینک نے شرح سود 100 بیسس پوائنٹس کم کر دی',
      },
    },
    {
      slug: 'federal-relief-flood-sindh-2026',
      category: 'pakistan',
      en: {
        title: 'Cabinet approves new relief package for flood-hit Sindh districts',
        slug: 'federal-relief-flood-sindh-2026',
        dek: 'The federal government announced cash grants and wheat subsidies for 12 districts after late monsoon rains displaced thousands of families.',
        body: 'The federal cabinet signed off on a **Rs25 billion** relief package targeting southern Sindh districts still recovering from flooding.\n\nOfficials said disbursements would begin next week through Benazir Income Support Programme channels.\n\nProvincial disaster management authorities will coordinate shelter materials.',
        urSlug: 'sindh-sailab-eedad-pakij-manzoor',
        urTitle: 'وفاقی کابینہ نے سندھ سیلاب زدگان کے لیے امدادی پیکج منظور کیا',
      },
    },
    {
      slug: 'pta-5g-spectrum-auction-2026',
      category: 'tech-telecom',
      en: {
        title: 'PTA opens 5G spectrum auction with three operators in the race',
        slug: 'pta-5g-spectrum-auction-2026',
        dek: 'Pakistan Telecommunication Authority set a base price for 5G bands as Jazz, Telenor and Zong confirmed participation in the multiday auction.',
        body: 'The **PTA** formally opened bidding for 5G spectrum blocks on Monday, with a reserve price designed to encourage rapid rollout in major cities.\n\nOperators must meet coverage milestones within 24 months.\n\nIndustry groups welcomed the timeline but asked for clearer handset affordability plans.',
        urSlug: 'pta-ne-5g-spectrum-nelami-shuru-kardi',
        urTitle: 'پی ٹی اے نے 5G اسپیکٹرم نیلامی کا آغاز کر دیا',
      },
    },
  ]

  for (const sample of sampleArticles) {
    const cat = await payload.find({
      collection: 'categories',
      where: { slug: { equals: sample.category } },
      limit: 1,
    })
    const categoryId = cat.docs[0]?.id
    if (!categoryId) continue
    const categoryColor =
      CATEGORIES.find((c) => c.slug === sample.category)?.color ?? '#0E7C5A'
    const heroMediaId = await upsertHeroMedia(
      payload,
      sample.en.slug,
      sample.en.title,
      categoryColor,
    )
    const existing = await payload.find({
      collection: 'articles',
      locale: 'en',
      where: { slug: { equals: sample.en.slug } },
      limit: 1,
    })
    if (existing.docs[0]) {
      if (heroMediaId && !existing.docs[0].heroImage) {
        await payload.update({
          collection: 'articles',
          id: existing.docs[0].id,
          data: { heroImage: heroMediaId },
          overrideAccess: true,
        })
      }
      continue
    }

    const created = await payload.create({
      collection: 'articles',
      locale: 'en',
      data: {
        title: sample.en.title,
        slug: sample.en.slug,
        dek: sample.en.dek,
        keyPoints: [{ point: 'Verified against official statements' }, { point: 'Updated as sources publish' }],
        body: md(sample.en.body),
        whatItMeans: md('Households may see lower loan instalments if banks transmit the rate cut.'),
        faqs: [{ q: 'When does this take effect?', a: 'Immediately unless a specific date is stated.' }],
        category: categoryId,
        author: authorId,
        ...(heroMediaId ? { heroImage: heroMediaId } : {}),
        workflow: 'published',
        priority: 'normal',
        sources: [{ name: 'Zaviya monitoring', url: 'https://zaviya.pk', tier: 2 }],
        _status: 'published',
        publishedAt: new Date().toISOString(),
      },
      draft: false,
      overrideAccess: true,
    })
    await payload.update({
      collection: 'articles',
      id: created.id,
      locale: 'ur',
      data: {
        title: sample.en.urTitle,
        slug: sample.en.urSlug,
        dek: 'تفصیلات ذرائع کے مطابق اپ ڈیٹ کی جاتی ہیں۔',
        keyPoints: [{ point: 'سرکاری بیانات سے تصدیق' }],
        body: md('حکومت نے اعلان کیا ہے کہ امداد جلد جاری کی جائے گی۔'),
        whatItMeans: md('عام گھرانوں پر ممکنہ مالی اثرات مثبت ہو سکتے ہیں۔'),
        faqs: [{ q: 'یہ کب سے لاگو ہے؟', a: 'فوری طور پر، جب تک الگ تاریخ نہ دی گئی ہو۔' }],
      },
      overrideAccess: true,
    })
  }

  if (apiKey) {
    writeWorkerEnv(apiKey)
    console.log('\n=== Bot API key (also written to apps/worker/.env) ===')
    console.log(apiKey)
    console.log('Authorization: users API-Key', apiKey)
  } else {
    console.warn('Could not retrieve bot API key — enable API key on bot@zaviya.pk in admin.')
  }

  console.log('Seed completed.')
}

try {
  await seed()
} catch (err) {
  console.error(err)
  process.exit(1)
}
