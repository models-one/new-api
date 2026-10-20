import PlusIcon from 'lucide-react/dist/esm/icons/plus'
import { useTranslation } from 'react-i18next'

import { Accordion } from '@/components/disclosure/Accordion'

const QUESTIONS = [
  {
    question: 'Which models can I call?',
    answer: 'Every model in the catalogue. It lists each model’s vendor, price and supported endpoints.',
  },
  {
    question: 'How am I billed?',
    answer:
      'Pay as you go from your balance. Each request is priced by the model it used, per token or per call, and recorded in your usage logs.',
  },
  {
    question: 'Can I see prices before I call a model?',
    answer: 'Yes. The model catalogue lists the price of every model for your group before you send a request.',
  },
  {
    question: 'What happens when an upstream provider fails?',
    answer:
      'The request is retried on another channel that serves the same model, within the retry limit the operator has set.',
  },
  {
    question: 'Can I limit what an API key can do?',
    answer: 'Yes. Each key can have its own quota, expiry date, allowed models and allowed IP addresses.',
  },
  {
    question: 'Is streaming supported?',
    answer: 'Yes. Server-sent event streams are passed through as the upstream produces them.',
  },
] as const

export function FaqSection() {
  const { t } = useTranslation()

  return (
    <section aria-labelledby="home-faq" className="px-4 py-20 sm:px-8 lg:py-24">
      <div className="mx-auto grid max-w-[1200px] gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-12">
        <h2 className="text-2xl font-bold text-[var(--home-ink)] sm:text-3xl" id="home-faq">
          {t('Questions and answers')}
        </h2>

        <Accordion className="border-t border-[var(--home-line)]">
          {QUESTIONS.map((item) => (
            <Accordion.Item className="border-b border-[var(--home-line)]" key={item.question} value={item.question}>
              <Accordion.Header headingLevel={3}>
                <Accordion.Trigger className="flex w-full items-center justify-between gap-6 py-5 text-left text-base font-semibold text-[var(--home-ink)] hover:text-[var(--home-blue)] [&[data-panel-open]>svg]:rotate-45">
                  {t(item.question)}
                  <PlusIcon aria-hidden="true" className="size-5 shrink-0 text-[var(--home-blue)] transition-transform" />
                </Accordion.Trigger>
              </Accordion.Header>
              {/* Padding sits on the inner block so the panel can collapse all the way to 0. */}
              <Accordion.Panel className="h-[var(--accordion-panel-height)] pb-0 text-[15px] leading-7 transition-[height] duration-300 ease-out data-[ending-style]:h-0 data-[starting-style]:h-0">
                <p className="pb-5 pr-10">{t(item.answer)}</p>
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
      </div>
    </section>
  )
}
