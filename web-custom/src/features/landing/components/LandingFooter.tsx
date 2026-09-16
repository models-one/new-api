import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { serverStatusQuery } from '@/lib/api/status'

export function LandingFooter() {
  const { t } = useTranslation()
  const statusQuery = useQuery(serverStatusQuery())
  const systemName = statusQuery.data?.system_name?.trim() ?? ''
  const year = new Date().getFullYear()

  return (
    // No `landing-deferred-section` here: `content-visibility` reserved 720px for a strip
    // that is barely 200px tall, which on a phone rendered as a band of empty black under
    // the page. The section above is long enough to be worth deferring; this is not.
    <footer className="border-t border-white/10 bg-[#05070a]">
      <div className="mx-auto flex max-w-[1440px] flex-col items-center gap-7 px-4 py-10 sm:px-8 lg:flex-row lg:justify-between lg:px-12 lg:py-12">
        <div className="text-xl font-bold text-[#dfe2f2]">{systemName}</div>
        <nav aria-label={t('Resource links')} className="flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm">
          {/* These pages exist as routes. They used to be `#privacy` / `#terms` anchors
              that scrolled nowhere while the real pages sat one link away. */}
          <Link className="landing-footer-link" to="/privacy-policy">{t('Privacy Policy')}</Link>
          <Link className="landing-footer-link" to="/user-agreement">{t('Terms of Service')}</Link>
          <Link className="landing-footer-link" to="/pricing">{t('Pricing')}</Link>
          <Link className="landing-footer-link" to="/about">{t('About')}</Link>
          <a className="landing-footer-link" href="https://github.com/QuantumNous/new-api">GitHub</a>
        </nav>
        <p className="text-center text-xs text-[#b9cacb] lg:text-right">
          © {year} {systemName}
        </p>
      </div>
    </footer>
  )
}
