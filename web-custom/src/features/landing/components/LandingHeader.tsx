import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { serverStatusQuery } from '@/lib/api/status'

export function LandingHeader() {
  const { t } = useTranslation()
  const statusQuery = useQuery(serverStatusQuery())
  const systemName = statusQuery.data?.system_name?.trim() ?? ''
  const docsLink = statusQuery.data?.docs_link?.trim() ?? ''

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#0a0e19]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-8 lg:px-12">
        <div className="flex min-w-0 items-center gap-6">
          <Link className="shrink-0 text-[22px] font-bold text-[#00f0ff] transition-opacity hover:opacity-80" to="/">
            {systemName}
          </Link>
          {/* Visible on a phone too. Hiding it behind `md:` left every public page with no
              way to reach any other public page from a handset. */}
          <nav
            aria-label={t('Public navigation')}
            className="scroll-x-hint flex min-w-0 items-center gap-2"
          >
            <Link className="landing-nav-link shrink-0" to="/models">{t('Models')}</Link>
            <Link className="landing-nav-link shrink-0" to="/pricing">{t('Pricing')}</Link>
            <Link className="landing-nav-link shrink-0" to="/rankings">{t('Rankings')}</Link>
            {docsLink === '' ? null : (
              <a className="landing-nav-link shrink-0" href={docsLink} rel="noreferrer" target="_blank">
                {t('Docs')}
              </a>
            )}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
          <Link className="hidden px-4 py-2 text-sm text-foreground transition-colors hover:text-[#00f0ff] sm:inline-flex" to="/dashboard">
            {t('Sign In')}
          </Link>
          <Link
            className="inline-flex min-h-10 items-center rounded-[4px] bg-[#00f0ff] px-4 py-2 text-sm font-bold text-[#05070a] transition-[box-shadow,background-color] hover:bg-[#7df4ff] hover:shadow-[0_0_18px_rgba(0,240,255,0.4)] sm:px-6"
            to="/dashboard"
          >
            {t('Get Started')}
          </Link>
        </div>
      </div>
    </header>
  )
}
