import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import modelsOneMark from '@/assets/models-one-mark.png'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { BrandMark } from '@/components/system/BrandMark'
import { serverStatusQuery } from '@/lib/api/status'

export function LandingHeader() {
  const { t } = useTranslation()
  const statusQuery = useQuery(serverStatusQuery())
  const systemName = statusQuery.data?.system_name?.trim() ?? ''
  // The operator's logo wins; the bundled mark keeps the corner branded before one is set
  // or while `/api/status` is unreachable.
  const logo = statusQuery.data?.logo?.trim() || modelsOneMark
  const docsLink = statusQuery.data?.docs_link?.trim() ?? ''

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--home-line)] bg-[var(--home-header)] px-4 backdrop-blur-xl sm:px-8">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-6">
          <Link className="shrink-0" to="/">
            <BrandMark
              logo={logo}
              markClassName="h-8 max-w-40"
              name={systemName}
              nameClassName="hidden text-lg font-bold text-[var(--home-ink)] sm:inline"
            />
          </Link>
          {/* Visible on a phone too: without it a handset has no way to reach the other public pages. */}
          <nav aria-label={t('Public navigation')} className="scroll-x-hint flex min-w-0 items-center gap-1">
            <Link className="home-nav-link shrink-0" to="/models">{t('Models')}</Link>
            <Link className="home-nav-link shrink-0" to="/pricing">{t('Pricing')}</Link>
            <Link className="home-nav-link shrink-0" to="/rankings">{t('Rankings')}</Link>
            {docsLink === '' ? null : (
              <a className="home-nav-link shrink-0" href={docsLink} rel="noreferrer" target="_blank">
                {t('Docs')}
              </a>
            )}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <ThemeToggle />
          <Link className="home-nav-link hidden sm:inline-flex" to="/sign-in">
            {t('Sign In')}
          </Link>
          <Link className="home-button-primary min-h-10 px-4 text-sm" to="/sign-up">
            {t('Sign up free')}
          </Link>
        </div>
      </div>
    </header>
  )
}
