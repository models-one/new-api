import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/form'
import { Dialog, toErrorMessage, toast } from '@/components/overlay'
import { Turnstile } from '@/components/system/Turnstile'
import { Alert, Button } from '@/components/ui'
import {
  EMAIL_MAX_LENGTH,
  RESEND_COUNTDOWN_SECONDS,
  VERIFICATION_CODE_LENGTH,
  sendEmailVerificationCode,
  useResendCountdown,
  validateEmailAddress,
} from '@/features/auth/sign-up'
import { bindEmail } from '@/features/profile/identity-api'
import { selfUserQuery } from '@/lib/api/user'

import type { AuthServerConfig } from '@/features/auth/server-config'

type EmailBindDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  config: AuthServerConfig
  /** The address currently on the account, or '' when there is none. */
  currentEmail: string
}

/**
 * Binding or replacing the account's e-mail address.
 *
 * Two requests: `GET /api/verification?email=…` mails a six-character code, then
 * `POST /api/oauth/email/bind` exchanges `{ email, code }` for the binding. Neither route
 * consults the `email_verification` flag — both are registered unconditionally in
 * `router/api-router.go` — so this is available on every deployment that can send mail.
 *
 * The send step needs working SMTP. On the dev server it answers
 * `{"success":false,"message":"invalid SMTP account"}`, and that message is shown verbatim
 * rather than being replaced with a guess about what went wrong.
 *
 * The resend lock is the shared `useResendCountdown`: `GET /api/verification` sits behind
 * `EmailVerificationRateLimit`, and with Turnstile on every click also burns a token.
 */
export function EmailBindDialog(props: EmailBindDialogProps) {
  const { config, currentEmail, onOpenChange, open } = props
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [codeError, setCodeError] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const [turnstileToken, setTurnstileToken] = useState('')
  const [turnstileKey, setTurnstileKey] = useState(0)

  const countdown = useResendCountdown(RESEND_COUNTDOWN_SECONDS)
  const turnstileReady = !config.turnstileEnabled || turnstileToken !== ''

  // `useResendCountdown` returns a fresh object every render but a stable `reset`, so the
  // effect depends on the function rather than the wrapper it arrived in.
  const resetCountdown = countdown.reset

  useEffect(() => {
    if (open) return
    setEmail('')
    setCode('')
    setEmailError(null)
    setCodeError(null)
    setSendError(null)
    setTurnstileToken('')
    resetCountdown()
  }, [open, resetCountdown])

  /** A Turnstile token is single use, so a spent one is dropped and the widget re-rendered. */
  const consumeTurnstileToken = () => {
    if (!config.turnstileEnabled) return
    setTurnstileToken('')
    setTurnstileKey((current) => current + 1)
  }

  const sendCode = useMutation({
    mutationFn: (address: string) => sendEmailVerificationCode(address, turnstileToken),
    onError: (failure: unknown) => setSendError(toErrorMessage(failure)),
    onSettled: consumeTurnstileToken,
    onSuccess: () => {
      setSendError(null)
      countdown.start()
      toast.success(t('Verification code sent. Check your inbox.'))
    },
  })

  const bind = useMutation({
    mutationFn: (input: { email: string; code: string }) => bindEmail(input.email, input.code),
    onError: (failure: unknown) => setCodeError(toErrorMessage(failure)),
    onSuccess: async () => {
      toast.success(t('Email address linked'))
      onOpenChange(false)
      await queryClient.invalidateQueries({ queryKey: selfUserQuery().queryKey })
    },
  })

  const emailIssueMessage = (): string | null => {
    const issue = validateEmailAddress(email)
    if (issue === undefined) return null
    if (issue === 'email-required') return t('Enter an email address.')
    if (issue === 'email-too-long') {
      return t('Use at most {{count}} characters.', { count: EMAIL_MAX_LENGTH })
    }
    return t('That does not look like an email address.')
  }

  const handleSend = () => {
    const issue = emailIssueMessage()
    setEmailError(issue)
    if (issue !== null) return
    if (!turnstileReady) {
      setSendError(t('Complete the verification challenge first.'))
      return
    }
    sendCode.mutate(email.trim())
  }

  const handleBind = () => {
    const issue = emailIssueMessage()
    setEmailError(issue)
    if (issue !== null) return
    if (code.trim().length !== VERIFICATION_CODE_LENGTH) {
      setCodeError(t('The code is {{count}} characters long.', { count: VERIFICATION_CODE_LENGTH }))
      return
    }
    setCodeError(null)
    bind.mutate({ code: code.trim(), email: email.trim() })
  }

  const busy = sendCode.isPending || bind.isPending
  const formId = 'profile-bind-email'

  return (
    <Dialog
      description={
        currentEmail === ''
          ? t('The address is used for account notifications and for signing in.')
          : t('This replaces {{email}}, which stops being linked to your account.', { email: currentEmail })
      }
      footer={
        <>
          <Button disabled={busy} onClick={() => onOpenChange(false)} variant="quiet">
            {t('Cancel')}
          </Button>
          <Button aria-busy={bind.isPending} disabled={busy} form={formId} type="submit">
            {currentEmail === '' ? t('Link email') : t('Replace email')}
          </Button>
        </>
      }
      onOpenChange={(next) => {
        if (busy && !next) return
        onOpenChange(next)
      }}
      open={open}
      scrollBody={false}
      size="sm"
      title={currentEmail === '' ? t('Link an email address') : t('Change email address')}
    >
      <form
        className="flex flex-col gap-4"
        id={formId}
        onSubmit={(event) => {
          event.preventDefault()
          handleBind()
        }}
      >
        {sendError === null ? null : <Alert tone="destructive">{sendError}</Alert>}

        <Input
          autoComplete="email"
          disabled={busy}
          error={emailError}
          label={t('Email address')}
          maxLength={EMAIL_MAX_LENGTH}
          onChange={(event) => {
            setEmail(event.target.value)
            setEmailError(null)
          }}
          placeholder="you@example.com"
          type="email"
          value={email}
        />

        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
          <Input
            autoComplete="one-time-code"
            description={t('Sent to the address above.')}
            disabled={busy}
            error={codeError}
            inputClassName="mono"
            label={t('Verification code')}
            maxLength={VERIFICATION_CODE_LENGTH}
            onChange={(event) => {
              setCode(event.target.value)
              setCodeError(null)
            }}
            value={code}
          />
          <Button
            aria-busy={sendCode.isPending}
            className="sm:mt-7"
            disabled={busy || countdown.isActive || !turnstileReady}
            onClick={handleSend}
            variant="outline"
          >
            {countdown.isActive
              ? t('{{seconds}}s', { seconds: countdown.secondsLeft })
              : t('Send code')}
          </Button>
        </div>

        {config.turnstileEnabled ? (
          <Turnstile
            onExpire={() => setTurnstileToken('')}
            onVerify={setTurnstileToken}
            refreshKey={turnstileKey}
            siteKey={config.turnstileSiteKey}
          />
        ) : null}
      </form>
    </Dialog>
  )
}
