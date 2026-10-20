import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { ModelSwitchCard } from '@/features/landing/components/ModelSwitchCard'
import { pricingQuery } from '@/lib/api/pricing'

export function LandingHero() {
  const { t } = useTranslation()
  const pricing = useQuery(pricingQuery())
  const modelCount = pricing.data?.data?.length ?? 0
  const providerCount = pricing.data?.vendors?.length ?? 0

  return (
    <section aria-labelledby="home-title" className="relative overflow-hidden px-4 pb-20 pt-16 sm:px-8 lg:pb-28 lg:pt-24">
      <div aria-hidden="true" className="home-iso-grid pointer-events-none absolute inset-0" />

      <div className="relative mx-auto grid max-w-[1200px] grid-cols-[minmax(0,1fr)] items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16">
        <div>
          <h1
            className="text-[40px] font-extrabold leading-[1.15] text-[var(--home-ink)] sm:text-5xl lg:text-[58px]"
            id="home-title"
          >
            {t('Chinese large models,')}
            <br />
            {t('one API for all of them')}
          </h1>

          <p className="mt-6 max-w-[34rem] text-base leading-8 sm:text-lg">
            {t('OpenAI-compatible, so switching models means changing one parameter. You pay for what you call, and every call is itemised.')}
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link className="home-button-primary" to="/sign-up">
              {t('Sign up free')}
            </Link>
            <Link className="home-button-secondary" to="/models">
              {t('Browse models')}
            </Link>
          </div>

          {modelCount === 0 ? null : (
            <p className="mt-6 text-sm text-[var(--home-faint)]">
              {providerCount === 0
                ? t('{{models}} models available right now', { models: modelCount })
                : t('{{models}} models from {{providers}} providers, available right now', {
                    models: modelCount,
                    providers: providerCount,
                  })}
            </p>
          )}
        </div>

        <ModelSwitchCard />
      </div>
    </section>
  )
}
