import { useMutation } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/form/Input'
import { toErrorMessage, toast } from '@/components/overlay/toast'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { MaskedValue } from '@/components/ui/MaskedValue'
import { Spinner } from '@/components/ui/Spinner'
import { AuthLayout } from '@/features/auth/AuthLayout'
import {
  RESET_COUNTDOWN_SECONDS,
  confirmPasswordReset,
} from '@/features/auth/password-reset/api'
import { useResendCountdown } from '@/features/auth/sign-up/use-resend-countdown'

export type ResetPasswordSearch = {
  email?: string
  token?: string
}

/** `maskSecret` keeps a head and a tail, which would reveal 11 of a 12-character password. */
function maskGeneratedPassword(): string {
  return '••••••••••••'
}

/**
 * `/reset` and `/user/reset` — the landing page for the e-mailed link.
 *
 * The link carries `email` and `token`. The user does NOT choose a password here:
 * `POST /api/user/reset` generates one server-side and returns it in `data`, once. So the
 * page is a confirmation, and the result is a live credential — rendered through
 * `MaskedValue` with an explicit copy control rather than printed into a sentence, and
 * masked completely (the kit's default mask keeps a head and a tail, which on a 12-character
 * secret hides almost nothing).
 *
 * The legacy page also wrote the password to the clipboard automatically. That is dropped
 * on purpose: silently placing a credential on the system clipboard is not something a
 * confirmation click should do.
 */
export function ResetPasswordPage(props: ResetPasswordSearch) {
  const { t } = useTranslation()

  const email = props.email?.trim() ?? ''
  const token = props.token?.trim() ?? ''
  const linkIsComplete = email !== '' && token !== ''

  const [newPassword, setNewPassword] = useState<string | null>(null)
  const countdown = useResendCountdown(RESET_COUNTDOWN_SECONDS)

  const confirm = useMutation({
    mutationFn: () => confirmPasswordReset(email, token),
    onError: (error: unknown) => {
      toast.error(
        toErrorMessage(error, t('Could not reset the password. Request a new link and try again.')),
      )
    },
    onSuccess: (password: string) => {
      setNewPassword(password)
      toast.success(t('Your password was reset.'))
    },
  })

  const handleConfirm = () => {
    if (!linkIsComplete) return
    // Started before the request: `/api/user/reset` sits behind `CriticalRateLimit`, so a
    // user hammering a link with a stale token would spend their allowance in seconds.
    countdown.start()
    confirm.mutate()
  }

  return (
    <AuthLayout
      description={
        newPassword === null
          ? t('Confirm the reset for this address and we will issue a new password.')
          : t('Copy your new password before you leave this page.')
      }
      title={t('Reset password')}
    >
      {linkIsComplete ? null : (
        <Alert tone="destructive">
          {t('This reset link is incomplete. Request a new one from the forgot-password page.')}
        </Alert>
      )}

      <Input
        autoComplete="email"
        label={t('Email')}
        placeholder={t('No address in this link')}
        readOnly
        type="email"
        value={email}
      />

      {newPassword === null ? null : (
        <>
          <Alert title={t('Password reset')} tone="success">
            {t('It is shown once and cannot be retrieved again. Sign in with it, then change it from your account settings.')}
          </Alert>

          <div aria-label={t('New password')} className="flex flex-col gap-2" role="group">
            <span className="eyebrow">{t('New password')}</span>
            <MaskedValue
              copyLabel={t('Copy new password')}
              copyable
              hideLabel={t('Hide password')}
              maskFn={maskGeneratedPassword}
              showLabel={t('Show password')}
              value={newPassword}
            />
          </div>
        </>
      )}

      {newPassword === null ? (
        <Button
          aria-busy={confirm.isPending}
          className="w-full"
          disabled={!linkIsComplete || confirm.isPending || countdown.isActive}
          onClick={handleConfirm}
        >
          {confirm.isPending ? <Spinner decorative size="sm" /> : null}
          {countdown.isActive && !confirm.isPending
            ? t('Try again in {{seconds}}s', { seconds: countdown.secondsLeft })
            : t('Set a new password')}
        </Button>
      ) : (
        <Button className="w-full" render={<Link to="/sign-in" />}>
          {t('Back to sign in')}
        </Button>
      )}

      {newPassword === null ? (
        <p className="text-sm leading-6 text-muted">
          <Link
            className="font-semibold text-primary underline underline-offset-2 hover:text-primary-strong"
            to="/sign-in"
          >
            {t('Back to sign in')}
          </Link>
        </p>
      ) : null}
    </AuthLayout>
  )
}
