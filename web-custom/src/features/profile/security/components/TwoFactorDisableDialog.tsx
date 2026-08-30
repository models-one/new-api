import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/form'
import { ConfirmDialog, toErrorMessage, toast } from '@/components/overlay'
import { disableTwoFactor } from '@/features/profile/security/api'

type TwoFactorDisableDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Turning 2FA off.
 *
 * `controller.Disable2FA` accepts a live TOTP code OR an unused backup code, and
 * spends the backup code if that is what it gets — hence the two-line hint rather
 * than a digits-only field. It then bumps the auth version, which signs every
 * other session out.
 */
export function TwoFactorDisableDialog(props: TwoFactorDisableDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  const disable = useMutation({
    mutationFn: (value: string) => disableTwoFactor(value),
    onSuccess: () => {
      toast.success(t('Two-factor authentication is off'))
      void queryClient.invalidateQueries({ queryKey: ['profile', 'security'] })
      props.onOpenChange(false)
    },
    onError: (failure: unknown) => setError(toErrorMessage(failure)),
  })

  const { open } = props
  useEffect(() => {
    if (open) return
    setCode('')
    setError(null)
  }, [open])

  return (
    <ConfirmDialog
      cancelLabel={t('Keep it on')}
      confirmLabel={t('Turn off two-factor authentication')}
      description={t(
        'Your account will be protected by its password alone, and every other session will be signed out.',
      )}
      destructive
      isLoading={disable.isPending}
      onConfirm={() => {
        const value = code.trim()
        if (value === '') {
          setError(t('Enter a verification code or a backup code to continue.'))
          return
        }
        setError(null)
        disable.mutate(value)
      }}
      onOpenChange={props.onOpenChange}
      open={props.open}
      title={t('Turn off two-factor authentication?')}
    >
      <div className="mt-4">
        <Input
          autoComplete="one-time-code"
          description={t('Use the six-digit code from your authenticator, or one of your backup codes.')}
          error={error}
          inputClassName="mono"
          label={t('Verification code or backup code')}
          onChange={(event) => {
            setCode(event.target.value)
            setError(null)
          }}
          value={code}
        />
      </div>
    </ConfirmDialog>
  )
}
