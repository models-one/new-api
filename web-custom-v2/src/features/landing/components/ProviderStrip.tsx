import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { pricingQuery } from '@/lib/api/pricing'

// Shown until the catalogue loads, or when the operator has not assigned vendors.
const FALLBACK_PROVIDERS = ['OpenAI', 'Anthropic', 'Google', 'DeepSeek', 'Mistral', 'xAI', 'Qwen', 'Moonshot']

// Below this, a scrolling row shows the same few names chasing each other; keep it static.
const MIN_MARQUEE_PROVIDERS = 6

export function ProviderStrip() {
  const { t } = useTranslation()
  const pricing = useQuery(pricingQuery())
  const vendorNames = (pricing.data?.vendors ?? []).map((vendor) => vendor.name.trim()).filter(Boolean)
  const providers = vendorNames.length === 0 ? FALLBACK_PROVIDERS : vendorNames.slice(0, 10)
  const items = providers.map((name) => (
    <li className="text-lg font-bold whitespace-nowrap text-[#dfe2f2]/55" key={name}>
      {name}
    </li>
  ))

  return (
    <section aria-labelledby="landing-providers" className="border-y border-white/10 bg-[#111214] px-4 py-10 sm:px-8">
      <h2 className="text-center text-xs font-semibold uppercase tracking-[0.14em] text-[#989ca4]" id="landing-providers">
        {t('Models from every major provider')}
      </h2>
      <div
        className="landing-marquee mx-auto mt-6 max-w-[1120px]"
        data-marquee={providers.length >= MIN_MARQUEE_PROVIDERS ? '' : undefined}
      >
        <div className="landing-marquee-track">
          <ul aria-labelledby="landing-providers" className="landing-marquee-list">
            {items}
          </ul>
          {/* The second copy makes the loop seamless; the CSS only shows it while the row scrolls. */}
          <ul aria-hidden="true" className="landing-marquee-list landing-marquee-copy">
            {items}
          </ul>
        </div>
      </div>
    </section>
  )
}
