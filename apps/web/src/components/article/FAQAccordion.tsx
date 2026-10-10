import type { FAQ, Locale } from '@zaviya/shared'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { t } from '@/lib/i18n'

export function FAQAccordion({ faqs, locale }: { faqs: FAQ[]; locale: Locale }) {
  if (!faqs.length) return null
  const d = t(locale)
  return (
    <section className="my-10">
      <h2 className="mb-4 font-display text-h2 font-semibold">{d.faq}</h2>
      <Accordion type="single" collapsible className="rounded-[var(--radius-card)] border border-border px-4">
        {faqs.map((f, i) => (
          <AccordionItem key={i} value={`faq-${i}`}>
            <AccordionTrigger>{f.q}</AccordionTrigger>
            <AccordionContent>{f.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  )
}
