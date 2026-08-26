import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

export function LandingHeader() {
  const { t } = useTranslation()

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#0a0e19]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 sm:px-8 lg:px-12">
        <div className="flex items-center gap-8">
          <Link className="text-[22px] font-bold text-[#00f0ff] transition-opacity hover:opacity-80" to="/">
            Models.one
          </Link>
          <nav aria-label={t('Public navigation')} className="hidden items-center gap-2 md:flex">
            <Link className="landing-nav-link" to="/models">{t('Models')}</Link>
            <a className="landing-nav-link" href="#capabilities">{t('Pricing')}</a>
            <a className="landing-nav-link" href="#integration">{t('Docs')}</a>
            <Link className="landing-nav-link" to="/organization">{t('Enterprise')}</Link>
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
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
