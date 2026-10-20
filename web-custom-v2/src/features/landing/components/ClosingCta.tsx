import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

export function ClosingCta() {
  const { t } = useTranslation()

  return (
    <section
      aria-labelledby="home-closing"
      className="relative overflow-hidden bg-[linear-gradient(120deg,#0f46d6,#1a5cff_55%,#2e9bff)] px-4 py-16 sm:px-8"
    >
      <div className="relative mx-auto flex max-w-[1200px] flex-col items-start justify-between gap-8 md:flex-row md:items-center">
        <div>
          <h2 className="text-2xl font-bold text-white sm:text-3xl" id="home-closing">
            {t('Start building today')}
          </h2>
          <p className="mt-3 max-w-xl text-base leading-7 text-white/85">
            {t('Create an account, add balance and make your first request in minutes.')}
          </p>
        </div>
        <Link
          className="inline-flex min-h-12 shrink-0 items-center rounded-[8px] bg-white px-7 text-base font-bold text-[#1a5cff] transition-colors hover:bg-[#eaf1ff]"
          to="/sign-up"
        >
          {t('Sign up free')}
        </Link>
      </div>
    </section>
  )
}
