import { Link, useSearch } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { AuthLayout } from '@/features/auth/AuthLayout'
import { AuthConfigGate } from '@/features/auth/components/AuthConfigGate'
import { AuthTermsFooter } from '@/features/auth/components/LegalConsent'
import { captureReferralCode } from '@/features/auth/referral'
import { requiresLegalConsent, useAuthServerConfig } from '@/features/auth/server-config'
import { SignInForm } from '@/features/auth/sign-in/SignInForm'

/**
 * `/sign-in`.
 *
 * Everything below the heading is decided by `GET /api/status`, so the form sits behind
 * `AuthConfigGate`: a deployment with passwords off must never flash a password form,
 * and one with GitHub off must never flash a GitHub button.
 */
export function SignInPage() {
  const { t } = useTranslation()
  const search = useSearch({ from: '/sign-in' })
  const { config, isError, isPending } = useAuthServerConfig()

  // A referral link can land on any public page, including this one. The code has to be
  // captured before the visitor walks to sign-up or through an OAuth provider.
  useEffect(() => {
    captureReferralCode()
  }, [])

  // The footnote is only offered once the config is known AND names a document worth
  // pointing at: `AuthLayout` reserves space for whatever it is handed, so passing an
  // element that renders nothing leaves a gap under the card.
  const showsTerms = !isPending && !isError && requiresLegalConsent(config)

  return (
    <AuthLayout
      footer={showsTerms ? <AuthTermsFooter config={config} variant="sign-in" /> : undefined}
      title={t('Sign in')}
    >
      <AuthConfigGate>
        {(resolvedConfig) => (
          <>
            <SignInForm config={resolvedConfig} redirectTo={search.redirect} />

            {resolvedConfig.registerEnabled && !resolvedConfig.selfUseModeEnabled ? (
              <p className="text-center text-xs leading-5 text-muted">
                {t("Don't have an account?")}
                {' '}
                <Link
                  className="font-semibold text-primary underline underline-offset-2 hover:text-primary-strong"
                  to="/sign-up"
                >
                  {t('Create an account')}
                </Link>
              </p>
            ) : null}
          </>
        )}
      </AuthConfigGate>
    </AuthLayout>
  )
}
