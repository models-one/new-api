import ArrowRightIcon from 'lucide-react/dist/esm/icons/arrow-right'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import modelsOneMarkGold from '@/assets/models-one-mark-gold.png'
import { ConsolePreview } from '@/features/landing/components/ConsolePreview'
import { pricingQuery } from '@/lib/api/pricing'

export function LandingHero() {
  const { t } = useTranslation()
  const pricing = useQuery(pricingQuery())
  const modelCount = pricing.data?.data?.length ?? 0
  const providerCount = pricing.data?.vendors?.length ?? 0

  return (
    <section className="relative overflow-hidden px-4 pb-20 pt-32 sm:px-8 lg:px-12 lg:pt-36">
      <div aria-hidden="true" className="landing-dot-grid pointer-events-none absolute inset-x-0 top-0 h-[720px]" />
      <div
        aria-hidden="true"
        className="landing-glow pointer-events-none absolute inset-x-0 top-0 h-[560px] bg-[radial-gradient(ellipse_at_top,rgba(231,173,87,0.16),transparent_62%)]"
      />
      <div
        aria-hidden="true"
        className="landing-orb pointer-events-none absolute -left-32 top-40 size-[420px] rounded-full bg-[#e7ad57]/10 blur-[120px]"
      />
      <div
        aria-hidden="true"
        className="landing-orb pointer-events-none absolute -right-32 top-72 size-[380px] rounded-full bg-[#90b6a0]/10 blur-[120px] [--landing-orb-x:-48px] [animation-delay:-7s]"
      />

      <div className="relative mx-auto grid max-w-[1200px] items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="landing-hero-exit text-center lg:text-left">
          <div className="landing-rise inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#202225] px-4 py-1.5">
            <span aria-hidden="true" className="landing-status-dot size-2 rounded-full bg-[#e7ad57]" />
            <span className="text-xs font-semibold text-[#e7ad57]">{t('One API for every major model')}</span>
          </div>

          <h1 className="landing-rise mt-7 text-5xl font-extrabold leading-[1.06] text-[#dfe2f2] [--landing-delay:90ms] sm:text-6xl lg:text-[68px]">
            {t('The AI gateway')}{' '}
            <span className="landing-gradient-text block">{t('built for production')}</span>
          </h1>

          <p className="landing-rise mx-auto mt-7 max-w-2xl text-base leading-7 text-[#b9cacb] [--landing-delay:180ms] sm:text-lg lg:mx-0">
            {t('Reach every major model through one OpenAI-compatible API, with automatic failover, usage analytics and per-key controls.')}
          </p>

          <div className="landing-rise mt-9 flex flex-col justify-center gap-3 [--landing-delay:270ms] sm:flex-row sm:gap-4 lg:justify-start">
            <Link className="landing-cta-primary" to="/dashboard">
              {t('Get started free')}
              <ArrowRightIcon aria-hidden="true" className="size-4" />
            </Link>
            <Link className="landing-cta-secondary" to="/models">
              {t('Browse models')}
            </Link>
          </div>

          {modelCount === 0 ? null : (
            <p className="landing-rise mt-6 text-sm text-[#989ca4] [--landing-delay:360ms]">
              {providerCount === 0
                ? t('{{models}} models available right now', { models: modelCount })
                : t('{{models}} models from {{providers}} providers, available right now', {
                    models: modelCount,
                    providers: providerCount,
                  })}
            </p>
          )}
        </div>

        {/* The brand mark; the header already names the site, so this is decoration. */}
        <div aria-hidden="true" className="landing-hero-exit landing-mark-exit">
          <div className="landing-rise landing-logo-stage relative mx-auto grid aspect-square w-full max-w-[320px] place-items-center [--landing-delay:200ms] lg:max-w-[480px]">
            <div className="landing-orbit landing-orbit-outer absolute size-[92%] rounded-full border border-[#e7ad57]/15" />
            <div className="landing-orbit landing-orbit-inner absolute size-[72%] rounded-full border border-white/10" />
            <div className="absolute size-[60%] rounded-full bg-[radial-gradient(circle,rgba(231,173,87,0.18),transparent_70%)]" />
            <div className="landing-logo-float relative z-10 size-[46%]">
              <img alt="" className="size-full object-contain drop-shadow-[0_0_34px_rgba(231,173,87,0.35)]" src={modelsOneMarkGold} />
            </div>
          </div>
        </div>
      </div>

      {/* Three wrappers because each sets its own `animation`: scroll tilt, entrance, then the border glow inside. */}
      <div className="landing-console-tilt">
        <div className="landing-rise [--landing-delay:450ms]">
          <ConsolePreview />
        </div>
      </div>
    </section>
  )
}
