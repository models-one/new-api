import { Link } from '@tanstack/react-router'
import { Fragment, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { SkipToMain } from '@/components/system/SkipToMain'
import { Skeleton } from '@/components/ui/Skeleton'
import { useServerStatus } from '@/hooks/use-server-status'
import { cn } from '@/lib/utils'

type PublicLegalLink = {
  key: string
  label: string
  to: '/about' | '/privacy-policy' | '/user-agreement'
}

type PublicPageFrameProps = {
  children: ReactNode
  /** Accessible name for the `main` landmark. */
  mainLabel: string
  /**
   * `document` centres the content in a reading column. `full` hands the whole width to the
   * child, for an operator-supplied home page that brings its own layout.
   */
  variant?: 'document' | 'full'
}

const MAIN_ID = 'main-content'

/**
 * Public chrome for the content routes. The console's `AppShell` is behind the auth guard,
 * so these unauthenticated pages carry their own header, `main` landmark and footer.
 *
 * The footer's legal links are config-driven: `/api/status` reports
 * `user_agreement_enabled` and `privacy_policy_enabled`, which controller/misc.go derives
 * from whether the corresponding document is a non-empty string. A link to a document the
 * operator never configured would only lead to an empty state, so it is not rendered.
 */
export function PublicPageFrame(props: PublicPageFrameProps) {
  const { t } = useTranslation()
  const { data: status, isPending } = useServerStatus()

  const legalLinks: PublicLegalLink[] = []
  if (status?.user_agreement_enabled === true) {
    legalLinks.push({ key: 'user-agreement', label: t('User Agreement'), to: '/user-agreement' })
  }
  // `privacy_policy_enabled` is not on the shared ServerStatus type yet; it is served under
  // the index signature, so it is read as `unknown` and narrowed here.
  if (status?.privacy_policy_enabled === true) {
    legalLinks.push({ key: 'privacy-policy', label: t('Privacy Policy'), to: '/privacy-policy' })
  }
  legalLinks.push({ key: 'about', label: t('About'), to: '/about' })

  return (
    <div className="settings-canvas flex min-h-screen flex-col text-foreground">
      <SkipToMain targetId={MAIN_ID} />

      <header className="border-b border-border bg-sidebar/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-[1100px] items-center justify-between gap-4 px-4 sm:px-6">
          <Link
            className="text-lg font-bold text-primary transition-opacity hover:opacity-80"
            to="/"
          >
            Models.one
          </Link>
          <nav aria-label={t('Public navigation')}>
            <Link
              className="inline-flex min-h-9 items-center rounded-[4px] border border-primary px-3 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
              to="/dashboard"
            >
              {t('Open console')}
            </Link>
          </nav>
        </div>
      </header>

      <main
        aria-label={props.mainLabel}
        className={cn(
          'w-full flex-1',
          props.variant === 'full'
            ? ''
            : 'mx-auto max-w-[1100px] px-4 py-10 sm:px-6 lg:py-14',
        )}
        id={MAIN_ID}
      >
        {props.children}
      </main>

      <footer className="border-t border-border bg-sidebar/60">
        <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between">
          <p className="text-xs text-muted">© {new Date().getFullYear()} Models.one</p>
          {isPending ? (
            <Skeleton label={t('Loading site configuration')} width="14rem" />
          ) : (
            <nav
              aria-label={t('Legal and policy links')}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs"
            >
              {legalLinks.map((link, index) => (
                <Fragment key={link.key}>
                  {index > 0 ? (
                    <span aria-hidden="true" className="text-muted/40">
                      ·
                    </span>
                  ) : null}
                  <Link className="text-muted transition-colors hover:text-foreground" to={link.to}>
                    {link.label}
                  </Link>
                </Fragment>
              ))}
            </nav>
          )}
        </div>
      </footer>
    </div>
  )
}
