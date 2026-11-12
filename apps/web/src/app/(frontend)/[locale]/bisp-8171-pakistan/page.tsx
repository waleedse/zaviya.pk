import Link from 'next/link'
import { FAQAccordion } from '@/components/article/FAQAccordion'
import { JsonLd } from '@/components/seo/JsonLd'
import { englishOnly } from '@/lib/english-only'
import { localePath } from '@/lib/i18n'
import { parseLocale } from '@/lib/locale'
import { search } from '@/lib/queries'
import { breadcrumbJsonLd, buildPageMetadata, faqJsonLd } from '@/lib/seo'
import { BISP, OFFICIAL_LINKS, PROGRAMMES, REGISTRATION_GUIDES } from '@/lib/bisp-8171'

export const revalidate = 1800

const PATH = '/bisp-8171-pakistan'

export async function generateMetadata() {
  return buildPageMetadata({
    locale: 'en',
    title: 'BISP 8171 Online Check: Web Portal, Registration and Balance (Official Links)',
    description: `Check your BISP eligibility on the official 8171 web portal, find registration centres and guides, and the helpline ${BISP.helpline}. Official links only: Zaviya never asks for your CNIC.`,
    enPath: PATH,
    absoluteTitle: true,
  })
}

const FAQS = [
  { q: 'How do I do a BISP 8171 online check?', a: `Open ${BISP.portalHost} (type it yourself or use the link on this page), enter your CNIC and the captcha shown on the portal, and it shows your household eligibility. Enter your CNIC only on a ${BISP.portalHost} address.` },
  { q: 'Is there a BISP 8171 check balance option?', a: `The 8171 portal we checked is an eligibility check, not a balance page. bisp.gov.pk lists a Kafaalat Portal and a Beneficiaries Portal for beneficiaries; we have no official wording on what balance information they show. For payment questions call the BISP helpline ${BISP.helpline}.` },
  { q: 'What is the BISP 8171 web portal?', a: `It is BISP's own eligibility page at ${BISP.portalHost}: you enter a CNIC and a captcha, and it tells you about your household's eligibility. It is run by BISP, not by Zaviya.` },
  { q: 'How does BISP 8171 online registration work?', a: 'BISP registers households through the National Socio-Economic Registry (NSER). bisp.gov.pk points to NADRA\'s list of NSER registration centres and publishes registration guides for Kafaalat, NSER, Nashonuma and Taleemi Wazaif; both are linked on this page. We could not find an official page that lets you register by yourself online, so do not pay anyone who says they can do it for you.' },
  { q: 'What is the BISP helpline number?', a: `The helpline shown on bisp.gov.pk is ${BISP.helpline}.` },
  { q: 'Can I check BISP by SMS to 8171?', a: 'The official pages we read describe the web check and carry a public-awareness video titled 8171, but do not set out SMS instructions. We do not repeat SMS rules we could not verify on an official BISP page; use the web portal or call the helpline.' },
  { q: 'Does Zaviya ask for my CNIC or take BISP applications?', a: 'No. This page only links to the official BISP sites. Never send your CNIC, a code or money to anyone who contacts you about BISP, including through this page.' },
]

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  englishOnly(locale, PATH)
  const news = await search('en', 'BISP').then((r) => r.docs.slice(0, 6)).catch(() => [])
  const L = OFFICIAL_LINKS

  return (
    <div className="pb-10">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', url: localePath('en', '/') },
            { name: 'BISP 8171', url: localePath('en', PATH) },
          ]),
          faqJsonLd(FAQS),
        ]}
      />
      <section className="border-b border-border bg-surface py-8 md:py-12">
        <div className="container-wide flex flex-col gap-4">
          <nav aria-label="Breadcrumb" className="text-sm text-fg-muted">
            <Link href={localePath('en', '/')} className="hover:underline">
              Home
            </Link>{' '}
            › BISP 8171
          </nav>
          <h1 className="font-display text-[clamp(1.9rem,1.4rem+2vw,3rem)] font-extrabold leading-tight">BISP 8171: online check, web portal and registration</h1>
          <p className="max-w-[720px] text-fg-muted">
            The official 8171 web portal checks your household&apos;s BISP eligibility with your CNIC. This page links to the official BISP sites only and explains what each one does. Checked against bisp.gov.pk on 12 November 2026.
          </p>
          <div className="max-w-[720px] rounded-xl bg-accent-soft p-4">
            <a href={L.portal.url} rel="noopener" className="font-display text-lg font-bold underline">
              Open the official 8171 portal ({BISP.portalHost})
            </a>
            <p className="mt-1 text-sm">Type your CNIC only on a {BISP.portalHost} address. Zaviya does not collect CNICs, codes or money, and never will.</p>
          </div>
        </div>
      </section>

      <div className="container-wide mt-8 max-w-[860px] space-y-8">
        <section>
          <h2 className="font-display text-xl font-bold">8171 online check, step by step</h2>
          <ol className="mt-3 list-decimal space-y-1 ps-5">
            <li>Open <a href={L.portal.url} rel="noopener" className="underline">{BISP.portalHost}</a> in your browser and check the address bar shows exactly that name.</li>
            <li>Enter your 13-digit CNIC and the captcha code shown on the portal.</li>
            <li>Read the eligibility result for your household. For anything the page does not explain, call {BISP.helpline}.</li>
          </ol>
          <p className="mt-3 text-sm text-fg-muted">Source: {L.portal.note}</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold">Check balance and payments</h2>
          <p className="mt-2">
            The 8171 portal is an eligibility check. For beneficiaries, bisp.gov.pk lists two portals; open them from the BISP site and follow what they ask:
          </p>
          <ul className="mt-2 list-disc space-y-1 ps-5">
            <li><a href={L.kafaalat.url} rel="noopener" className="underline">{L.kafaalat.label}</a></li>
            <li><a href={L.beneficiaries.url} rel="noopener" className="underline">{L.beneficiaries.label}</a></li>
          </ul>
          <p className="mt-2 text-sm text-fg-muted">We do not state payment amounts or instalment dates here because the official pages we read do not publish them. Payment news we report is below.</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold">Online registration</h2>
          <p className="mt-2">BISP registers households through the National Socio-Economic Registry (NSER). The official routes:</p>
          <ul className="mt-2 list-disc space-y-1 ps-5">
            <li><a href={L.nser.url} rel="noopener" className="underline">{L.nser.label}</a>: find a registration centre.</li>
            {REGISTRATION_GUIDES.map((g) => (
              <li key={g.url}><a href={g.url} rel="noopener" className="underline">{g.label}</a></li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-fg-muted">Programmes listed on bisp.gov.pk: {PROGRAMMES.join(', ')}.</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold">Latest BISP payment news</h2>
          {news.length ? (
            <ul className="mt-3 space-y-2">
              {news.map((a) => (
                <li key={a.id}>
                  <Link href={a.href} className="font-semibold underline">{a.title}</Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-fg-muted">
              No recent BISP story yet. <Link href={localePath('en', '/latest')} className="underline">See the latest news</Link>.
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="font-display text-xl font-bold">Scam warning (Zaviya advice)</h2>
          <p className="mt-2">
            Do not give your CNIC, a code or money to anyone who calls, messages or visits about BISP, and do not pay an &ldquo;agent&rdquo; to register or check you. Use only the official sites on this page, or call {BISP.helpline}. To complain, bisp.gov.pk lists the <a href={L.complaints.url} rel="noopener" className="underline">{L.complaints.label}</a>.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold">Official sources</h2>
          <ul className="mt-3 space-y-1">
            {[L.portal, L.site, L.kafaalat, L.beneficiaries, L.nser, L.complaints].map((s) => (
              <li key={s.url}>
                <a href={s.url} rel="noopener" className="underline">{s.label}</a>
                <span className="text-sm text-fg-muted"> — {s.note}</span>
              </li>
            ))}
            <li className="text-sm text-fg-muted">Helpline shown on bisp.gov.pk: {BISP.helpline}.</li>
          </ul>
        </section>
        <FAQAccordion faqs={FAQS} locale="en" />
      </div>
    </div>
  )
}
