import type { FAQ, Locale } from '@zaviya/shared'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { t } from '@/lib/i18n'

export function FAQAccordion({ faqs, locale }: { faqs: FAQ[]; locale: Locale }) {
  if (!faqs.length) return null
  const d = t(locale)
  return (
    <section className="my-10">
      <h2 className="mb-4 font-display text-h2 font-extrabold">{locale === 'ur' ? 'قارئین کے سوالات' : 'Questions readers ask'}</h2>
      <span className="sr-only">{d.faq}</span>
      <Accordion type="single" collapsible defaultValue="faq-0" className="space-y-2.5">
        {faqs.map((f, i) => (
          <AccordionItem key={i} value={`faq-${i}`} className="rounded-2xl border border-border bg-surface px-5">
            <AccordionTrigger className="text-[1.05rem] font-bold">{f.q}</AccordionTrigger>
            <AccordionContent className="leading-relaxed">{f.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  )
}
