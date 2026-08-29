import { Link, useNavigate } from '@tanstack/react-router'
import i18next from 'i18next'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/form/Input'
import { toast } from '@/components/overlay/toast'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Spinner } from '@/components/ui/Spinner'
import { AuthLayout } from '@/features/auth/AuthLayout'
import { getSavedLanguage, resolveAuthRedirect } from '@/features/auth/auth-redirect'
import { verifyTwoFactorLogin } from '@/features/auth/otp/api'
import { OtpCodeInput } from '@/features/auth/otp/OtpCodeInput'
import {
  clearPending2FAChallenge,
  readPending2FAChallenge,
  usePending2FAStore,
} from '@/features/auth/otp/pending-2fa'
import {
  FORMATTED_BACKUP_CODE_LENGTH,
  cleanBackupCode,
  formatBackupCode,
  isValidBackupCode,
  isValidTotpCode,
} from '@/features/auth/otp/validation'
import { applyAuthBundle, isAuthBundle } from '@/lib/auth-session'

type VerificationMethod = 'authenticator' | 'backup'

/**
 * The second-factor challenge.
 *
 * `/sign-in` sends the browser here after `POST /api/user/login` answered
 * `require_2fa` instead of an auth bundle, having stashed the flow token in
 * `pending-2fa`. Nothing on this page is config-driven — the challenge exists
 * because the account enabled it, not because `/api/status` says so — so there
 * is no `AuthConfigGate` here; `AuthLayout` still waits for the brand.
 */
export function OtpPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const challenge = usePending2FAStore((state) => state.challenge)
  const [method, setMethod] = useState<VerificationMethod>('authenticator')
  const [authenticatorCode, setAuthenticatorCode] = useState('')
  const [backupCode, setBackupCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const expiresAt = challenge?.expiresAt ?? null

  /**
   * Drops the challenge the moment the server's TTL runs out. Without this the
   * user keeps typing into a form whose only possible answer is "session
   * expired"; with it the page turns into the recovery panel on its own.
   */
  useEffect(() => {
    if (expiresAt === null) return undefined

    const remaining = expiresAt * 1000 - Date.now()
    if (remaining <= 0) {
      clearPending2FAChallenge()
      return undefined
    }

    const timer = globalThis.setTimeout(() => clearPending2FAChallenge(), remaining)
    return () => globalThis.clearTimeout(timer)
  }, [expiresAt])

  if (challenge === null) {
    return (
      <AuthLayout
        description={t('Two-factor codes are tied to a short-lived sign-in session. Start again to get a fresh one.')}
        title={t('Your sign-in session expired')}
      >
        <Alert tone="warning" title={t('Nothing left to verify')}>
          {t('The sign-in attempt that asked for this code is no longer valid.')}
        </Alert>
        <Button render={<Link to="/sign-in" />}>{t('Back to sign in')}</Button>
      </AuthLayout>
    )
  }

  const usingBackupCode = method === 'backup'
  const enteredCode = usingBackupCode ? backupCode : authenticatorCode
  const codeLooksValid = usingBackupCode
    ? isValidBackupCode(backupCode)
    : isValidTotpCode(authenticatorCode)

  const handleMethodChange = (next: VerificationMethod) => {
    if (next === method) return
    setMethod(next)
    setFormError(null)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)

    if (!codeLooksValid) {
      setFormError(
        usingBackupCode
          ? t('A backup code is eight characters, written as XXXX-XXXX.')
          : t('Enter the six-digit code from your authenticator app.'),
      )
      return
    }

    const current = readPending2FAChallenge()
    if (current === null) return

    setSubmitting(true)
    try {
      const response = await verifyTwoFactorLogin({
        code: usingBackupCode ? cleanBackupCode(enteredCode) : enteredCode,
        flow_token: current.flowToken,
      })

      if (!response.success) {
        const message = response.message?.trim() ?? ''
        setFormError(message === '' ? t('That code was not accepted. Please try again.') : message)
        return
      }

      if (!isAuthBundle(response.data)) {
        setFormError(t('The server accepted the code but returned an unusable session. Please sign in again.'))
        return
      }

      const bundle = response.data
      clearPending2FAChallenge()
      applyAuthBundle(bundle)

      const language = getSavedLanguage(bundle.user)
      if (language !== undefined && language !== i18next.language) {
        await i18next.changeLanguage(language)
      }

      toast.success(t('Signed in'))
      // The sign-in page may hand the target over in the challenge or leave it on
      // the URL; either way it only reaches navigation through the redirect guard.
      const requestedRedirect =
        current.redirectTo ?? new URLSearchParams(window.location.search).get('redirect')
      void navigate({
        href: resolveAuthRedirect(requestedRedirect, window.location.origin),
        replace: true,
      })
    } catch {
      // `verifyTwoFactorLogin` opts out of the shared handlers, so nothing has
      // been shown yet and the transport failure has to surface here.
      setFormError(t('The code could not be verified. Check your connection and try again.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      description={t('One more step: confirm it is you with the second factor on your account.')}
      title={t('Two-factor authentication')}
    >
      <SegmentedControl
        fullWidth
        label={t('Verification method')}
        onChange={handleMethodChange}
        options={[
          { id: 'authenticator', label: t('Authenticator app') },
          { id: 'backup', label: t('Backup code') },
        ]}
        value={method}
      />

      <form className="flex flex-col gap-5" noValidate onSubmit={(event) => void handleSubmit(event)}>
        {usingBackupCode ? (
          <Input
            autoComplete="off"
            description={t('Eight characters in XXXX-XXXX form. Each backup code works only once.')}
            inputClassName="mono uppercase tracking-[0.2em]"
            label={t('Backup code')}
            maxLength={FORMATTED_BACKUP_CODE_LENGTH}
            onChange={(event) => setBackupCode(formatBackupCode(event.target.value))}
            spellCheck={false}
            value={backupCode}
          />
        ) : (
          <OtpCodeInput
            autoFocus
            description={t('Your authenticator app shows a new code every 30 seconds.')}
            label={t('Authenticator code')}
            onChange={setAuthenticatorCode}
            value={authenticatorCode}
          />
        )}

        {formError === null ? null : (
          <Alert icon={<TriangleAlertIcon />} tone="destructive">
            {formError}
          </Alert>
        )}

        <Button aria-busy={submitting} disabled={submitting || !codeLooksValid} type="submit">
          {submitting ? <Spinner decorative size="sm" /> : null}
          {t('Verify and sign in')}
        </Button>
      </form>

      <p className="text-sm leading-6 text-muted">
        {t('Lost access to both your authenticator and your backup codes? Ask an administrator to reset two-factor authentication on your account.')}
      </p>

      <Link
        className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
        to="/sign-in"
      >
        {t('Back to sign in')}
      </Link>
    </AuthLayout>
  )
}
