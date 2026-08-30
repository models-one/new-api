import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/form'
import { Dialog, toErrorMessage, toast } from '@/components/overlay'
import { Alert, Button } from '@/components/ui'
import { regenerateBackupCodes } from '@/features/profile/security/api'
import { BackupCodes } from '@/features/profile/security/components/BackupCodes'

type BackupCodesDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** `controller.RegenerateBackupCodes` calls `ValidateNumericCode`: six digits, no backup code. */
const TOTP_CODE_LENGTH = 6

/**
 * Replacing the backup codes.
 *
 * Two phases in one dialog: prove possession of the authenticator, then read the
 * new codes. The old codes stop working the moment the new set is issued, so the
 * first phase warns and the second one gates its own exit on an acknowledgement
 * — once this dialog closes the codes are gone for good.
 *
 * Unlike disabling 2FA, this endpoint does NOT accept a backup code; it validates
 * a numeric TOTP code only.
 */
export function BackupCodesDialog(props: BackupCodesDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [codes, setCodes] = useState<string[] | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)

  const regenerate = useMutation({
    mutationFn: (totp: string) => regenerateBackupCodes(totp),
    onSuccess: (data) => {
      setCodes(data.backup_codes)
      void queryClient.invalidateQueries({ queryKey: ['profile', 'security'] })
    },
    onError: (failure: unknown) => setError(toErrorMessage(failure)),
  })

  const { open } = props
  const { reset } = regenerate
  useEffect(() => {
    if (open) return
    setCode('')
    setError(null)
    setCodes(null)
    setAcknowledged(false)
    reset()
  }, [open, reset])

  const trimmedCode = code.replaceAll(' ', '')
  const busy = regenerate.isPending

  const finish = () => {
    toast.success(t('New backup codes are active'))
    props.onOpenChange(false)
  }

  return (
    <Dialog
      description={
        codes === null
          ? t('Your existing backup codes stop working as soon as new ones are issued.')
          : undefined
      }
      footer={
        codes === null ? (
          <>
            <Button disabled={busy} onClick={() => props.onOpenChange(false)} variant="quiet">
              {t('Cancel')}
            </Button>
            <Button
              aria-busy={busy}
              disabled={busy || trimmedCode.length !== TOTP_CODE_LENGTH}
              onClick={() => {
                setError(null)
                regenerate.mutate(trimmedCode)
              }}
            >
              {t('Generate new codes')}
            </Button>
          </>
        ) : (
          <Button disabled={!acknowledged} onClick={finish}>
            {t('Done')}
          </Button>
        )
      }
      onOpenChange={(next) => {
        if (busy && !next) return
        props.onOpenChange(next)
      }}
      open={props.open}
      size="md"
      title={codes === null ? t('Replace your backup codes') : t('Your new backup codes')}
    >
      {codes === null ? (
        <div className="flex flex-col gap-4">
          <Alert title={t('The codes you have now will stop working')} tone="warning">
            {t('Anything you saved earlier becomes useless once the new codes are issued.')}
          </Alert>

          <Input
            autoComplete="one-time-code"
            description={t('Enter the {{length}}-digit code your authenticator shows right now.', {
              length: TOTP_CODE_LENGTH,
            })}
            error={error}
            inputClassName="mono tracking-[0.3em]"
            inputMode="numeric"
            label={t('Verification code')}
            maxLength={TOTP_CODE_LENGTH}
            onChange={(event) => {
              setCode(event.target.value)
              setError(null)
            }}
            placeholder="000000"
            value={code}
          />
        </div>
      ) : (
        <BackupCodes
          acknowledged={acknowledged}
          codes={codes}
          onAcknowledgedChange={setAcknowledged}
        />
      )}
    </Dialog>
  )
}
