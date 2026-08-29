import { useMutation } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/form/Input'
import { toErrorMessage, toast } from '@/components/overlay/toast'
import { Turnstile } from '@/components/system/Turnstile'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { AuthLayout } from '@/features/auth/AuthLayout'
import { AuthConfigGate } from '@/features/auth/components/AuthConfigGate'
import {
  RESET_COUNTDOWN_SECONDS,
  requestPasswordResetEmail,
} from '@/features/auth/password-reset/api'
import { EMAIL_MAX_LENGTH } from '@/features/auth/sign-up/api'
import { validateEmailAddress, type SignUpIssue } from '@/features/auth/sign-up/schema'
import { useResendCountdown } from '@/features/auth/sign-up/use-resend-countdown'

import type { AuthServerConfig } from '@/features/auth/server-config'

type Translate = ReturnType<typeof useTranslation>['t']

function emailIssueMessage(issue: SignUpIssue, t: Translate): string {
  if (issue === 'email-invalid') return t('Enter a valid email address.')
  if (issue === 'email-too-long') {
    return t('Email must be at most {{max}} characters.', { max: EMAIL_MAX_LENGTH })
  }
  return t('Please enter your email address.')
}

/**
 * `/forgot-password` — step one of the reset, which only asks the server to send the link.
 *
 * Turnstile matters here for the same reason it does on sign-up: `/api/reset_password`
 * runs `middleware.TurnstileCheck()`, Cloudflare burns the token on the first siteverify,
 * and the widget has to be remounted afterwards or a second attempt fails a check the user
 * cannot see. The legacy form left the spent token in place, so its resend button was
 * guaranteed to fail once Turnstile was enabled.
 */
function ForgotPasswordForm(props: { config: AuthServerConfig }) {
  const { config } = props
  const { t } = useTranslation()

  const [email, setEmail] = useState('')
  const [emailIssue, setEmailIssue] = useState<SignUpIssue | undefined>(undefined)
  const [turnstileToken, setTurnstileToken] = useState('')
  const [turnstileKey, setTurnstileKey] = useState(0)

  const countdown = useResendCountdown(RESET_COUNTDOWN_SECONDS)
  const turnstileReady = !config.turnstileEnabled || turnstileToken !== ''

  const consumeTurnstileToken = () => {
    if (!config.turnstileEnabled) return
    setTurnstileToken('')
    setTurnstileKey((current) => current + 1)
  }

  const sendLink = useMutation({
    mutationFn: (address: string) => requestPasswordResetEmail(address, turnstileToken),
    onError: (error: unknown) => {
      toast.error(toErrorMessage(error, t('Could not send the reset email. Please try again.')))
    },
    onSettled: consumeTurnstileToken,
    onSuccess: () => {
      countdown.start()
      // Worded so it reveals nothing: the endpoint answers success for an address with no
      // account, and a confident "sent" would turn it into an account-existence oracle.
      toast.success(t('If that address has an account, a reset link is on its way.'))
    },
  })

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const issue = validateEmailAddress(email)
    setEmailIssue(issue)
    if (issue !== undefined) return

    if (!turnstileReady) {
      toast.info(t('Please wait a moment, the human check is still loading.'))
      return
    }

    sendLink.mutate(email.trim())
  }

  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
      <Input
        autoComplete="email"
        error={emailIssue === undefined ? undefined : emailIssueMessage(emailIssue, t)}
        inputMode="email"
        label={t('Email')}
        onChange={(event) => {
          setEmail(event.target.value)
          setEmailIssue(undefined)
        }}
        required
        type="email"
        value={email}
      />

      {config.turnstileEnabled ? (
        <Turnstile
          onExpire={() => setTurnstileToken('')}
          onVerify={setTurnstileToken}
          refreshKey={turnstileKey}
          siteKey={config.turnstileSiteKey}
        />
      ) : null}

      <Button
        aria-busy={sendLink.isPending}
        className="w-full"
        disabled={sendLink.isPending || countdown.isActive || !turnstileReady}
        type="submit"
      >
        {sendLink.isPending ? <Spinner decorative size="sm" /> : null}
        {countdown.isActive
          ? t('Resend in {{seconds}}s', { seconds: countdown.secondsLeft })
          : t('Send reset link')}
      </Button>
    </form>
  )
}

export function ForgotPasswordPage() {
  const { t } = useTranslation()

  return (
    <AuthLayout
      description={t('Enter the email address on your account and we will send you a reset link.')}
      title={t('Reset your password')}
    >
      <AuthConfigGate>{(config) => <ForgotPasswordForm config={config} />}</AuthConfigGate>

      <p className="text-sm leading-6 text-muted">
        {t('Remembered it?')}
        {' '}
        <Link
          className="font-semibold text-primary underline underline-offset-2 hover:text-primary-strong"
          to="/sign-in"
        >
          {t('Sign in')}
        </Link>
      </p>
    </AuthLayout>
  )
}
