import KeyRoundIcon from 'lucide-react/dist/esm/icons/key-round'
import ReceiptIcon from 'lucide-react/dist/esm/icons/receipt'
import RepeatIcon from 'lucide-react/dist/esm/icons/repeat'
import ShieldCheckIcon from 'lucide-react/dist/esm/icons/shield-check'
import { useTranslation } from 'react-i18next'

const CAPABILITIES = [
  {
    icon: KeyRoundIcon,
    title: 'One key for every model',
    description: 'Call any model in the catalogue with the same key and the same request format.',
  },
  {
    icon: RepeatIcon,
    title: 'Failover when an upstream breaks',
    description: 'A failed request is retried on another channel that serves the same model.',
  },
  {
    icon: ReceiptIcon,
    title: 'Pay per call, itemised',
    description: 'Each request is priced by the model it used and recorded in your usage log.',
  },
  {
    icon: ShieldCheckIcon,
    title: 'Limits on every key',
    description: 'Set a spending limit, expiry date, allowed models and allowed IP addresses per key.',
  },
] as const

export function Capabilities() {
  const { t } = useTranslation()

  return (
    <section aria-labelledby="home-capabilities" className="bg-[var(--home-paper)] px-4 py-20 sm:px-8 lg:py-24">
      <div className="mx-auto grid max-w-[1200px] gap-12 lg:grid-cols-[0.8fr_1.2fr]">
        <h2 className="text-2xl font-bold leading-snug text-[var(--home-ink)] sm:text-3xl" id="home-capabilities">
          {t('What you get behind the one API')}
        </h2>

        <ul className="grid gap-x-10 gap-y-10 sm:grid-cols-2">
          {CAPABILITIES.map((item) => {
            const Icon = item.icon
            return (
              <li key={item.title}>
                <Icon aria-hidden="true" className="size-6 text-[var(--home-blue)]" />
                <h3 className="mt-3 text-lg font-bold text-[var(--home-ink)]">{t(item.title)}</h3>
                <p className="mt-2 text-[15px] leading-7">{t(item.description)}</p>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
