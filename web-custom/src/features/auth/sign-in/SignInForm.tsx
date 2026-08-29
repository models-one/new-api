import { Link, useNavigate } from '@tanstack/react-router'
import KeyRoundIcon from 'lucide-react/dist/esm/icons/key-round'
import LogInIcon from 'lucide-react/dist/esm/icons/log-in'
import { useCallback, useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/form/Input'
import { PasswordInput } from '@/components/form/PasswordInput'
import { toErrorMessage, toast } from '@/components/overlay/toast'
import { Turnstile } from '@/components/system/Turnstile'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { LegalConsent } from '@/features/auth/components/LegalConsent'
import { OAuthProviders } from '@/features/auth/components/OAuthProviders'
import { hasOAuthProviders } from '@/features/auth/oauth-providers'
import { setPending2FAChallenge } from '@/features/auth/otp/pending-2fa'
import { requiresLegalConsent } from '@/features/auth/server-config'
import {
  passwordLogin,
  readLoginOutcome,
  validateSignInCredentials,
  type SignInFieldError,
  type SignInFieldErrors,
} from '@/features/auth/sign-in/api'
import { usePasskeyLogin } from '@/features/auth/sign-in/use-passkey-login'
import { useSignInCompletion } from '@/features/auth/sign-in/use-sign-in-completion'

import type { AuthServerConfig } from '@/features/auth/server-config'

type SignInFormProps = {
  /** Already resolved by `AuthConfigGate`; never the empty placeholder config. */
  config: AuthServerConfig
  /** The raw `?redirect=` value. Sanitized on use, never navigated to as given. */
  redirectTo?: string
}

/**
 * The five sign-in mechanisms, each rendered only when `/api/status` enables it:
 * password, passkey, WeChat, Telegram and redirect OAuth (the last three through the
 * shared `OAuthProviders`). A deployment that enables none says so instead of showing
 * an empty card.
 */
export function SignInForm(props: SignInFormProps) {
  const { config, redirectTo } = props
  const { t } = useTranslation()
  const navigate = useNavigate()
  const complete = useSignInCompletion(redirectTo)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<SignInFieldErrors>({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [turnstileToken, setTurnstileToken] = useState('')
  // Bumping this remounts the widget. A Turnstile token is single use: once the login
  // middleware has spent it on siteverify, the next attempt needs a freshly minted one.
  const [turnstileNonce, setTurnstileNonce] = useState(0)

  const consentRequired = requiresLegalConsent(config)
  const [consentGiven, setConsentGiven] = useState(false)
  const consentSatisfied = !consentRequired || consentGiven
  // Named so the buttons consent disables can say why they are disabled, instead of
  // leaving a screen reader with a dimmed control and no reason for it.
  const consentHintId = useId()
  const passkeyNoteId = useId()

  const canStart = useCallback(() => consentSatisfied, [consentSatisfied])

  const passkey = usePasskeyLogin({
    canStart,
    enabled: config.passkeyLoginEnabled,
    onAuthenticated: complete,
  })

  const showsOAuth = hasOAuthProviders(config)
  const hasAlternatives = config.passkeyLoginEnabled || showsOAuth
  const noSignInMethod = !config.passwordLoginEnabled && !hasAlternatives
  const busy = submitting || passkey.pending
  const blocked = busy || !consentSatisfied

  // A passkey button can be disabled for two unrelated reasons at once; both are on the
  // page as text, so both are named here rather than picking one.
  const passkeyDescription = [
    passkey.supported === false ? passkeyNoteId : '',
    consentSatisfied ? '' : consentHintId,
  ].filter((id) => id !== '').join(' ')

  const fieldErrorMessages: Record<SignInFieldError, string> = {
    'password-required': t('Enter your password.'),
    'username-required': t('Enter your username or email address.'),
  }

  const resetTurnstile = () => {
    if (!config.turnstileEnabled) return
    setTurnstileToken('')
    setTurnstileNonce((nonce) => nonce + 1)
  }

  const runPasswordLogin = async () => {
    setSubmitting(true)
    try {
      const outcome = readLoginOutcome(
        await passwordLogin({ password, turnstile: turnstileToken, username: username.trim() }),
      )

      if (outcome.kind === 'authenticated') {
        await complete(outcome.bundle)
        toast.success(t('Welcome back!'))
        return
      }

      if (outcome.kind === 'two-factor') {
        // Hand-off contract published by `features/auth/otp`: stash the challenge, then
        // navigate. The raw `?redirect=` rides along — the OTP page sanitizes it before
        // it navigates anywhere, exactly as this page does.
        setPending2FAChallenge({
          expiresAt: outcome.expiresAt,
          flowToken: outcome.flowToken,
          redirectTo,
        })
        await navigate({ replace: true, to: '/otp' })
        return
      }

      if (outcome.kind === 'rejected') {
        setFormError(outcome.message === '' ? t('Sign-in failed. Please try again.') : outcome.message)
      } else if (outcome.kind === 'flow-expired') {
        setFormError(t('This sign-in attempt expired. Please try again.'))
      } else {
        setFormError(t('Sign-in failed. Please try again.'))
      }
      resetTurnstile()
    } catch (error: unknown) {
      setFormError(toErrorMessage(error, t('Sign-in failed. Please try again.')))
      resetTurnstile()
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy || !consentSatisfied) return

    setFormError('')
    const errors = validateSignInCredentials({ password, username })
    setFieldErrors(errors)
    if (errors.username !== undefined || errors.password !== undefined) return

    if (config.turnstileEnabled && turnstileToken === '') {
      // The backend aborts a login whose `turnstile` query parameter is empty, so this
      // is the same rejection said earlier and in language the user can act on.
      setFormError(t('The human verification check has not finished. Please wait a moment and try again.'))
      return
    }

    void runPasswordLogin()
  }

  const legalConsent = (
    <div className="flex flex-col gap-1.5">
      <LegalConsent
        checked={consentGiven}
        config={config}
        disabled={busy}
        onCheckedChange={setConsentGiven}
      />
      {consentSatisfied ? null : (
        <p className="text-xs leading-5 text-muted" id={consentHintId}>
          {t('Accept the terms above to continue.')}
        </p>
      )}
    </div>
  )

  if (noSignInMethod) {
    return (
      <Alert title={t('Sign-in is unavailable')} tone="warning">
        {t('This deployment has no sign-in method enabled. Ask an administrator to enable one.')}
      </Alert>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {config.passwordLoginEnabled ? (
        <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
          <Input
            autoComplete="username"
            autoFocus
            disabled={busy}
            error={fieldErrors.username === undefined ? undefined : fieldErrorMessages[fieldErrors.username]}
            label={t('Username or email')}
            name="username"
            onChange={(event) => {
              setUsername(event.target.value)
              setFieldErrors((errors) => ({ ...errors, username: undefined }))
              setFormError('')
            }}
            placeholder={t('Enter your username or email')}
            required
            value={username}
          />

          <div className="flex flex-col gap-1.5">
            <PasswordInput
              autoComplete="current-password"
              disabled={busy}
              error={fieldErrors.password === undefined ? undefined : fieldErrorMessages[fieldErrors.password]}
              label={t('Password')}
              name="password"
              onChange={(event) => {
                setPassword(event.target.value)
                setFieldErrors((errors) => ({ ...errors, password: undefined }))
                setFormError('')
              }}
              placeholder={t('Enter your password')}
              required
              value={password}
            />
            <Link
              className="self-end text-xs font-semibold text-muted underline underline-offset-2 hover:text-foreground"
              to="/forgot-password"
            >
              {t('Forgot your password?')}
            </Link>
          </div>

          {formError === '' ? null : (
            <p className="text-xs leading-5 text-destructive" role="alert">{formError}</p>
          )}

          {config.turnstileEnabled ? (
            <Turnstile
              onExpire={() => setTurnstileToken('')}
              onVerify={setTurnstileToken}
              refreshKey={turnstileNonce}
              siteKey={config.turnstileSiteKey}
            />
          ) : null}

          {legalConsent}

          <Button
            aria-busy={submitting}
            aria-describedby={consentSatisfied ? undefined : consentHintId}
            className="w-full"
            disabled={blocked}
            type="submit"
          >
            {submitting ? <Spinner decorative size="sm" /> : <LogInIcon aria-hidden="true" />}
            {t('Sign in')}
          </Button>
        </form>
      ) : (
        legalConsent
      )}

      {hasAlternatives ? (
        <div className="flex flex-col gap-3">
          {config.passwordLoginEnabled ? (
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className="h-px flex-1 bg-border" />
              <span className="eyebrow">{t('Or continue with')}</span>
              <span aria-hidden="true" className="h-px flex-1 bg-border" />
            </div>
          ) : null}

          {config.passkeyLoginEnabled ? (
            <div className="flex flex-col gap-1.5">
              <Button
                aria-busy={passkey.pending}
                aria-describedby={passkeyDescription === '' ? undefined : passkeyDescription}
                className="w-full"
                disabled={blocked || passkey.supported !== true}
                onClick={passkey.start}
                variant="outline"
              >
                {passkey.pending
                  ? <Spinner decorative size="sm" />
                  : <KeyRoundIcon aria-hidden="true" />}
                {t('Sign in with a passkey')}
              </Button>
              {passkey.supported === false ? (
                <p className="text-xs leading-5 text-muted" id={passkeyNoteId}>
                  {t('This browser or device cannot use passkeys.')}
                </p>
              ) : null}
            </div>
          ) : null}

          <OAuthProviders
            canStart={canStart}
            config={config}
            disabled={blocked}
            hideSeparator
            onAuthenticated={complete}
          />
        </div>
      ) : null}
    </div>
  )
}
