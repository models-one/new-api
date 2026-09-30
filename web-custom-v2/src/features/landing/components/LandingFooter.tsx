import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { BrandMark } from '@/components/system/BrandMark'
import { serverStatusQuery } from '@/lib/api/status'

export function LandingFooter() {
  const { t } = useTranslation()
  const statusQuery = useQuery(serverStatusQuery())
  const systemName = statusQuery.data?.system_name?.trim() ?? ''
  const logo = statusQuery.data?.logo?.trim() ?? ''
  const docsLink = statusQuery.data?.docs_link?.trim() ?? ''
  const year = new Date().getFullYear()

  return (
    // No `landing-deferred-section` here: `content-visibility` reserves 720px, taller than
    // the footer, which on a phone rendered as a band of empty black under the page.
    <footer className="border-t border-white/10 bg-[#111214]">
      <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-14 sm:px-8 md:grid-cols-[1.4fr_repeat(3,1fr)] lg:px-12">
        <div>
          <BrandMark logo={logo} name={systemName} nameClassName="text-xl font-bold text-[#dfe2f2]" />
          <p className="mt-4 max-w-xs text-sm leading-6 text-[#989ca4]">
            {t('One OpenAI-compatible API for every major model.')}
          </p>
        </div>

        <nav aria-label={t('Product')}>
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#dfe2f2]">{t('Product')}</h2>
          <ul className="mt-4 space-y-3 text-sm">
            <li><Link className="landing-footer-link" to="/models">{t('Models')}</Link></li>
            <li><Link className="landing-footer-link" to="/pricing">{t('Pricing')}</Link></li>
            <li><Link className="landing-footer-link" to="/rankings">{t('Rankings')}</Link></li>
          </ul>
        </nav>

        <nav aria-label={t('Resources')}>
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#dfe2f2]">{t('Resources')}</h2>
          <ul className="mt-4 space-y-3 text-sm">
            {docsLink === '' ? null : (
              <li>
                <a className="landing-footer-link" href={docsLink} rel="noreferrer" target="_blank">{t('Docs')}</a>
              </li>
            )}
            <li><Link className="landing-footer-link" to="/about">{t('About')}</Link></li>
            <li><a className="landing-footer-link" href="https://github.com/QuantumNous/new-api">GitHub</a></li>
          </ul>
        </nav>

        <nav aria-label={t('Legal')}>
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#dfe2f2]">{t('Legal')}</h2>
          <ul className="mt-4 space-y-3 text-sm">
            <li><Link className="landing-footer-link" to="/privacy-policy">{t('Privacy Policy')}</Link></li>
            <li><Link className="landing-footer-link" to="/user-agreement">{t('Terms of Service')}</Link></li>
          </ul>
        </nav>
      </div>

      <div className="border-t border-white/10">
        <p className="mx-auto max-w-[1200px] px-4 py-6 text-xs text-[#989ca4] sm:px-8 lg:px-12">
          © {year} {systemName}
        </p>
      </div>
    </footer>
  )
}
