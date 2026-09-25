import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '@/components/ui/Alert'
import { AuthLayout } from '@/features/auth/AuthLayout'
import { AuthConfigGate } from '@/features/auth/components/AuthConfigGate'
import { AuthSwitchLink } from '@/features/auth/components/AuthSwitchLink'
import { AuthTermsFooter } from '@/features/auth/components/LegalConsent'
import { captureReferralCode } from '@/features/auth/referral'
import { useAuthServerConfig } from '@/features/auth/server-config'
import { SignUpForm } from '@/features/auth/sign-up/components/SignUpForm'

/**
 * `/sign-up` (and `/register`, which redirects here with its query string intact).
 *
 * Everything below the heading is decided by `/api/status`, so the body sits behind
 * `AuthConfigGate` and never renders against defaults: a form offering a password when the
 * operator turned password registration off would be a lie the server then rejects.
 */
export function SignUpPage() {
  const { t } = useTranslation()
  const { config, isError, isPending } = useAuthServerConfig()

  // A referral link lands anywhere with `?aff=`. Persist it before the user touches the
  // form so it survives both the form itself and a round trip through an OAuth provider.
  useEffect(() => {
    captureReferralCode()
  }, [])

  const configReady = !isPending && !isError

  return (
    <AuthLayout
      description={t('Set up an account to start routing requests.')}
      footer={configReady ? <AuthTermsFooter config={config} variant="sign-up" /> : undefined}
      title={t('Create an account')}
    >
      <AuthConfigGate>
        {(serverConfig) =>
          serverConfig.registerEnabled ? (
            <SignUpForm config={serverConfig} />
          ) : (
            <Alert title={t('Registration is closed')} tone="warning">
              {t('This deployment is not accepting new accounts right now.')}
            </Alert>
          )
        }
      </AuthConfigGate>

      <AuthSwitchLink action={t('Sign in')} prompt={t('Already have an account?')} to="/sign-in" />
    </AuthLayout>
  )
}
