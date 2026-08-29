import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import i18next from 'i18next'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/form/Input'
import { PasswordInput } from '@/components/form/PasswordInput'
import { toErrorMessage, toast } from '@/components/overlay/toast'
import { Turnstile } from '@/components/system/Turnstile'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { getSavedLanguage } from '@/features/auth/auth-redirect'
import { LegalConsent } from '@/features/auth/components/LegalConsent'
import { OAuthProviders } from '@/features/auth/components/OAuthProviders'
import { hasOAuthProviders } from '@/features/auth/oauth-providers'
import { readReferralCode } from '@/features/auth/referral'
import { requiresLegalConsent } from '@/features/auth/server-config'
import {
  EMAIL_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  RESEND_COUNTDOWN_SECONDS,
  USERNAME_MAX_LENGTH,
  VERIFICATION_CODE_LENGTH,
  registerAccount,
  sendEmailVerificationCode,
} from '@/features/auth/sign-up/api'
import {
  EMPTY_SIGN_UP_VALUES,
  buildRegisterPayload,
  validateEmailAddress,
  validateSignUpValues,
  type SignUpErrors,
  type SignUpIssue,
  type SignUpValues,
} from '@/features/auth/sign-up/schema'
import { useResendCountdown } from '@/features/auth/sign-up/use-resend-countdown'
import { applyAuthBundle } from '@/lib/auth-session'

import type { AuthServerConfig } from '@/features/auth/server-config'
import type { AuthBundle } from '@/features/auth/types'

type Translate = ReturnType<typeof useTranslation>['t']

function issueMessage(issue: SignUpIssue, t: Translate): string {
  switch (issue) {
    case 'username-required':
      return t('Please enter a username.')
    case 'username-too-long':
      return t('Username must be at most {{max}} characters.', { max: USERNAME_MAX_LENGTH })
    case 'password-required':
      return t('Please enter a password.')
    case 'password-too-short':
      return t('Password must be at least {{min}} characters.', { min: PASSWORD_MIN_LENGTH })
    case 'password-too-long':
      return t('Password must be at most {{max}} characters.', { max: PASSWORD_MAX_LENGTH })
    case 'confirm-password-required':
      return t('Please confirm your password.')
    case 'password-mismatch':
      return t('The two passwords do not match.')
    case 'email-required':
      return t('Please enter your email address.')
    case 'email-invalid':
      return t('Enter a valid email address.')
    case 'email-too-long':
      return t('Email must be at most {{max}} characters.', { max: EMAIL_MAX_LENGTH })
    case 'verification-code-required':
      return t('Please enter the verification code.')
    case 'verification-code-length':
      return t('The verification code is {{length}} characters long.', {
        length: VERIFICATION_CODE_LENGTH,
      })
  }
}

type SignUpFormProps = {
  config: AuthServerConfig
}

/**
 * The registration form.
 *
 * Two behaviours here are load-bearing and easy to lose:
 *
 * 1. A Turnstile token is SINGLE USE. `middleware.TurnstileCheck` calls Cloudflare's
 *    siteverify, which burns the token, so the one the "send code" request spends can
 *    never satisfy the later register call. Every request that passes through that
 *    middleware therefore ends by clearing the token AND bumping `turnstileKey`, which
 *    remounts the widget so it can issue a fresh one. Without the remount the widget keeps
 *    reporting its old, dead token and registration fails a check the user cannot see.
 * 2. The e-mail address and its code are required only while `/api/status.email_verification`
 *    is on. That condition is expressed in the schema (see `createSignUpSchema`) instead of
 *    the ad-hoc toasts the legacy form used, so both fields get inline errors.
 */
export function SignUpForm(props: SignUpFormProps) {
  const { config } = props
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [values, setValues] = useState<SignUpValues>(EMPTY_SIGN_UP_VALUES)
  const [errors, setErrors] = useState<SignUpErrors>({})
  const [consentError, setConsentError] = useState(false)
  const [agreedToLegal, setAgreedToLegal] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState('')
  const [turnstileKey, setTurnstileKey] = useState(0)

  const countdown = useResendCountdown(RESEND_COUNTDOWN_SECONDS)

  const emailVerificationRequired = config.emailVerificationEnabled
  const consentRequired = requiresLegalConsent(config)
  const turnstileReady = !config.turnstileEnabled || turnstileToken !== ''
  const consentSatisfied = !consentRequired || agreedToLegal

  /**
   * Drops the token the request just spent and forces a fresh widget. Called whether the
   * request succeeded or failed: siteverify ran either way.
   */
  const consumeTurnstileToken = () => {
    if (!config.turnstileEnabled) return
    setTurnstileToken('')
    setTurnstileKey((current) => current + 1)
  }

  const updateValue = (field: keyof SignUpValues, value: string) => {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => (current[field] === undefined ? current : { ...current, [field]: undefined }))
  }

  const sendCode = useMutation({
    mutationFn: (email: string) => sendEmailVerificationCode(email, turnstileToken),
    onError: (error: unknown) => {
      toast.error(toErrorMessage(error, t('Could not send the verification code. Please try again.')))
    },
    onSettled: consumeTurnstileToken,
    onSuccess: () => {
      countdown.start()
      toast.success(t('Verification code sent. Check your inbox.'))
    },
  })

  const register = useMutation({
    mutationFn: (formValues: SignUpValues) =>
      registerAccount(
        buildRegisterPayload(formValues, {
          affiliateCode: readReferralCode(),
          emailVerificationRequired,
        }),
        turnstileToken,
      ),
    onError: (error: unknown) => {
      toast.error(toErrorMessage(error, t('Could not create your account. Please try again.')))
    },
    onSettled: consumeTurnstileToken,
    onSuccess: () => {
      // Registration does not authenticate: the backend returns no bundle and sets no
      // session, so the only thing to do is hand the user to the sign-in page.
      toast.success(t('Account created. Sign in to continue.'))
      void navigate({ replace: true, to: '/sign-in' })
    },
  })

  const busy = register.isPending || sendCode.isPending

  const guardTurnstile = (): boolean => {
    if (turnstileReady) return true
    toast.info(t('Please wait a moment, the human check is still loading.'))
    return false
  }

  const guardConsent = (): boolean => {
    if (consentSatisfied) {
      setConsentError(false)
      return true
    }
    setConsentError(true)
    return false
  }

  const handleSendCode = () => {
    const emailIssue = validateEmailAddress(values.email)
    if (emailIssue !== undefined) {
      setErrors((current) => ({ ...current, email: emailIssue }))
      return
    }
    if (!guardTurnstile()) return
    sendCode.mutate(values.email.trim())
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const nextErrors = validateSignUpValues(values, { emailVerificationRequired })
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    if (!guardConsent()) return
    if (!guardTurnstile()) return

    register.mutate(values)
  }

  const handleOAuthAuthenticated = async (bundle: AuthBundle) => {
    applyAuthBundle(bundle)
    const savedLanguage = getSavedLanguage(bundle.user)
    if (savedLanguage !== undefined && savedLanguage !== i18next.language) {
      await i18next.changeLanguage(savedLanguage)
    }
    await navigate({ replace: true, to: '/dashboard' })
  }

  const resendLabel = countdown.isActive
    ? t('Resend in {{seconds}}s', { seconds: countdown.secondsLeft })
    : t('Send code')

  return (
    <div className="flex flex-col gap-5">
      {config.passwordRegisterEnabled ? (
        <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
          <Input
            autoComplete="username"
            description={t('Up to {{max}} characters. This is the name you sign in with.', {
              max: USERNAME_MAX_LENGTH,
            })}
            error={errors.username === undefined ? undefined : issueMessage(errors.username, t)}
            label={t('Username')}
            onChange={(event) => updateValue('username', event.target.value)}
            required
            value={values.username}
          />

          <PasswordInput
            autoComplete="new-password"
            description={t('Between {{min}} and {{max}} characters.', {
              max: PASSWORD_MAX_LENGTH,
              min: PASSWORD_MIN_LENGTH,
            })}
            error={errors.password === undefined ? undefined : issueMessage(errors.password, t)}
            label={t('Password')}
            onChange={(event) => updateValue('password', event.target.value)}
            required
            value={values.password}
          />

          <PasswordInput
            autoComplete="new-password"
            error={
              errors.confirmPassword === undefined
                ? undefined
                : issueMessage(errors.confirmPassword, t)
            }
            label={t('Confirm password')}
            onChange={(event) => updateValue('confirmPassword', event.target.value)}
            required
            value={values.confirmPassword}
          />

          {emailVerificationRequired ? (
            <>
              <Input
                autoComplete="email"
                error={errors.email === undefined ? undefined : issueMessage(errors.email, t)}
                inputMode="email"
                label={t('Email')}
                onChange={(event) => updateValue('email', event.target.value)}
                required
                type="email"
                value={values.email}
              />

              <Input
                autoComplete="one-time-code"
                description={t('We email a {{length}}-character code to that address.', {
                  length: VERIFICATION_CODE_LENGTH,
                })}
                error={
                  errors.verificationCode === undefined
                    ? undefined
                    : issueMessage(errors.verificationCode, t)
                }
                inputClassName="mono"
                label={t('Verification code')}
                onChange={(event) => updateValue('verificationCode', event.target.value)}
                required
                suffix={
                  <Button
                    aria-busy={sendCode.isPending}
                    disabled={busy || countdown.isActive || !turnstileReady}
                    onClick={handleSendCode}
                    size="sm"
                    variant="quiet"
                  >
                    {sendCode.isPending ? <Spinner decorative size="sm" /> : null}
                    {resendLabel}
                  </Button>
                }
                value={values.verificationCode}
              />
            </>
          ) : null}

          {config.turnstileEnabled ? (
            <Turnstile
              onExpire={() => setTurnstileToken('')}
              onVerify={setTurnstileToken}
              refreshKey={turnstileKey}
              siteKey={config.turnstileSiteKey}
            />
          ) : null}

          <LegalConsent
            checked={agreedToLegal}
            config={config}
            disabled={busy}
            onCheckedChange={(checked) => {
              setAgreedToLegal(checked)
              if (checked) setConsentError(false)
            }}
          />

          {consentError ? (
            <p className="text-xs leading-5 text-destructive" role="alert">
              {t('Please agree to the legal terms first.')}
            </p>
          ) : null}

          <Button
            aria-busy={register.isPending}
            className="w-full"
            disabled={busy || !consentSatisfied || !turnstileReady}
            type="submit"
          >
            {register.isPending ? <Spinner decorative size="sm" /> : null}
            {t('Create account')}
          </Button>
        </form>
      ) : (
        <Alert tone="info">
          {t('Password sign-up is turned off on this deployment. Use one of the options below.')}
        </Alert>
      )}

      <OAuthProviders
        canStart={guardConsent}
        config={config}
        disabled={busy}
        hideSeparator={!config.passwordRegisterEnabled}
        onAuthenticated={handleOAuthAuthenticated}
      />

      {/*
        With password sign-up off and no provider enabled, `OAuthProviders` renders null
        and the page would otherwise be an empty card.
      */}
      {!config.passwordRegisterEnabled && !hasOAuthProviders(config) ? (
        <Alert tone="warning">
          {t('No sign-up method is enabled on this deployment, so an account cannot be created here.')}
        </Alert>
      ) : null}
    </div>
  )
}
