import ArrowRightIcon from 'lucide-react/dist/esm/icons/arrow-right'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

export function ClosingCta() {
  const { t } = useTranslation()

  return (
    <section aria-labelledby="landing-closing" className="landing-reveal px-4 pb-24 sm:px-8 lg:px-12">
      <div className="landing-glow-border relative mx-auto max-w-[1200px] overflow-hidden rounded-[10px] bg-[#191b1e] px-6 py-16 text-center sm:px-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(231,173,87,0.18),transparent_65%)]"
        />
        <div className="relative">
          <h2 className="text-3xl font-extrabold text-[#dfe2f2] sm:text-4xl" id="landing-closing">
            {t('Start building today')}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-[#b9cacb]">
            {t('Create an account, add balance and make your first request in minutes.')}
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row sm:gap-4">
            <Link className="landing-cta-primary" to="/dashboard">
              {t('Get started free')}
              <ArrowRightIcon aria-hidden="true" className="size-4" />
            </Link>
            <Link className="landing-cta-secondary" to="/pricing">
              {t('See model pricing')}
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
