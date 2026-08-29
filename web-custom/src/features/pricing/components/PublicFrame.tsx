import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { SkipToMain } from '@/components/system/SkipToMain'

const MAIN_ID = 'pricing-main'

/**
 * The chrome around the public pricing routes.
 *
 * These pages are read by people who are not signed in, so they cannot use `AppShell`: that
 * shell sits inside the console auth guard and owns its own `main` landmark. The frame lives
 * in this feature because the lane rules forbid reaching into `features/landing`; it borrows
 * only the `.landing-*` classes, which are declared in the shared `styles/index.css`. A shared
 * public shell belongs in `src/components/layout/` once a second public route needs one.
 */
export function PublicFrame(props: { children: ReactNode }) {
  const { t } = useTranslation()

  return (
    <div className="landing-page flex min-h-screen flex-col text-foreground">
      <SkipToMain targetId={MAIN_ID} />

      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0a0e19]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-8 lg:px-12">
          <div className="flex min-w-0 items-center gap-6">
            <Link
              className="shrink-0 text-[22px] font-bold text-[#00f0ff] transition-opacity hover:opacity-80"
              to="/"
            >
              Models.one
            </Link>
            <nav aria-label={t('Public navigation')} className="hidden items-center gap-2 md:flex">
              <Link
                activeProps={{ 'aria-current': 'page' }}
                className="landing-nav-link"
                to="/pricing"
              >
                {t('Pricing')}
              </Link>
              <Link className="landing-nav-link" to="/dashboard">
                {t('Console')}
              </Link>
            </nav>
          </div>

          <Link
            className="inline-flex min-h-10 shrink-0 items-center rounded-[4px] bg-[#00f0ff] px-4 py-2 text-sm font-bold text-[#05070a] transition-[box-shadow,background-color] hover:bg-[#7df4ff] hover:shadow-[0_0_18px_rgba(0,240,255,0.4)] sm:px-6"
            to="/dashboard"
          >
            {t('Get started')}
          </Link>
        </div>
      </header>

      <main
        className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-10 sm:px-8 lg:px-12 lg:py-14"
        id={MAIN_ID}
      >
        {props.children}
      </main>

      <footer className="border-t border-white/10 bg-[#05070a]">
        <div className="mx-auto flex max-w-[1440px] flex-col items-center gap-4 px-4 py-8 text-sm sm:px-8 lg:flex-row lg:justify-between lg:px-12">
          <p className="text-muted">
            {t('Prices are published by this gateway and can change at any time.')}
          </p>
          <Link className="landing-footer-link" to="/">
            {t('Back to home')}
          </Link>
        </div>
      </footer>
    </div>
  )
}
