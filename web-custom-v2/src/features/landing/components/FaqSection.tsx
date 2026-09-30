import PlusIcon from 'lucide-react/dist/esm/icons/plus'
import { useTranslation } from 'react-i18next'

import { Accordion } from '@/components/disclosure/Accordion'
import { SectionHeading } from '@/features/landing/components/SectionHeading'

const QUESTIONS = [
  {
    question: 'Which SDKs and tools work with this gateway?',
    answer:
      'Anything that speaks the OpenAI API: set the base URL to this gateway and use your key. Claude Messages and Gemini native requests are accepted too.',
  },
  {
    question: 'How am I billed?',
    answer:
      'Pay as you go from your balance. Each request is priced by the model it used, per token or per call, and recorded in your usage logs.',
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
    question: 'Can I see prices before I call a model?',
    answer: 'Yes. The model catalogue lists the price of every model for your group before you send a request.',
  },
  {
    question: 'Is streaming supported?',
    answer: 'Yes. Server-sent event streams are passed through as the upstream produces them.',
  },
] as const

export function FaqSection() {
  const { t } = useTranslation()

  return (
    <section aria-labelledby="landing-faq" className="px-4 py-24 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-[840px]">
        <SectionHeading align="center" eyebrow={t('FAQ')} id="landing-faq" title={t('Questions and answers')} />

        <Accordion className="mt-12 border-t border-white/10">
          {QUESTIONS.map((item) => (
            <Accordion.Item className="border-b border-white/10" key={item.question} value={item.question}>
              <Accordion.Header headingLevel={3}>
                <Accordion.Trigger className="flex w-full items-center justify-between gap-6 py-5 text-left text-base font-semibold text-[#dfe2f2] hover:text-[#f6c477] [&[data-panel-open]>svg]:rotate-45">
                  {t(item.question)}
                  <PlusIcon aria-hidden="true" className="size-5 shrink-0 text-[#e7ad57] transition-transform" />
                </Accordion.Trigger>
              </Accordion.Header>
              {/* Padding sits on the inner block so the panel can collapse all the way to 0. */}
              <Accordion.Panel className="h-[var(--accordion-panel-height)] pb-0 text-sm leading-7 text-[#b9cacb] transition-[height] duration-300 ease-out data-[ending-style]:h-0 data-[starting-style]:h-0">
                <p className="pb-5 pr-10">{t(item.answer)}</p>
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
      </div>
    </section>
  )
}
