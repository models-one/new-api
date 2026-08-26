import { useTranslation } from 'react-i18next'

export function LandingFooter() {
  const { t } = useTranslation()

  return (
    <footer className="landing-deferred-section border-t border-white/10 bg-[#05070a]">
      <div className="mx-auto flex max-w-[1440px] flex-col items-center gap-7 px-4 py-10 sm:px-8 lg:flex-row lg:justify-between lg:px-12 lg:py-12">
        <div className="text-xl font-bold text-[#dfe2f2]">Models.one</div>
        <nav aria-label={t('Resource links')} className="flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm">
          <a className="landing-footer-link" href="#privacy">{t('Privacy Policy')}</a>
          <a className="landing-footer-link" href="#terms">{t('Terms of Service')}</a>
          <a className="landing-footer-link" href="#status">{t('Status')}</a>
          <a className="landing-footer-link" href="#contact">{t('Contact')}</a>
          <a className="landing-footer-link" href="https://github.com/QuantumNous/new-api">GitHub</a>
        </nav>
        <p className="text-center text-xs text-[#b9cacb] lg:text-right">
          © 2024 Models.one Inc. {t('Built for the future of AI.')}
        </p>
      </div>
    </footer>
  )
}
