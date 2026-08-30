import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/form'
import { Dialog, toErrorMessage, toast } from '@/components/overlay'
import { Alert, Button, MaskedValue, Skeleton } from '@/components/ui'
import {
  enableTwoFactor,
  startTwoFactorSetup,
  type TwoFactorSetup,
} from '@/features/profile/security/api'
import { BackupCodes } from '@/features/profile/security/components/BackupCodes'
import { QrCode } from '@/features/profile/security/qr/QrCode'

type TwoFactorSetupDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Step = 'scan' | 'codes' | 'verify'

const STEP_ORDER: readonly Step[] = ['scan', 'codes', 'verify']

/** `common.ValidateTOTPCode` strips spaces and then demands exactly six digits. */
const TOTP_CODE_LENGTH = 6

/**
 * The three-step enrolment: scan the secret, save the backup codes, prove the
 * authenticator works.
 *
 * `POST /api/user/2fa/setup` is fired when the dialog opens because that call is
 * what mints the secret and the backup codes; it also deletes any half-finished
 * previous attempt, so it must not run on page load, only on intent.
 *
 * The step order is not cosmetic. `POST /api/user/2fa/enable` is the point of no
 * return, and after it the backup codes are unreachable — so the user has to pass
 * through, and acknowledge, the codes screen before the verify step exists.
 */
export function TwoFactorSetupDialog(props: TwoFactorSetupDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [step, setStep] = useState<Step>('scan')
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null)
  const [setupError, setSetupError] = useState<string | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)

  const initialize = useMutation({
    mutationFn: startTwoFactorSetup,
    onSuccess: (data) => {
      setSetup(data)
      setSetupError(null)
    },
    onError: (failure: unknown) => setSetupError(toErrorMessage(failure)),
  })

  const enable = useMutation({
    mutationFn: (totp: string) => enableTwoFactor(totp),
    onSuccess: () => {
      toast.success(t('Two-factor authentication is on'))
      void queryClient.invalidateQueries({ queryKey: ['profile', 'security'] })
      props.onOpenChange(false)
    },
    onError: (failure: unknown) => setCodeError(toErrorMessage(failure)),
  })

  // Reset on every open so a dismissed attempt never leaks into the next one,
  // and start the setup call that mints the secret.
  const { open } = props
  const { mutate: beginSetup, reset: resetSetup } = initialize
  useEffect(() => {
    if (!open) return
    setStep('scan')
    setSetup(null)
    setSetupError(null)
    setAcknowledged(false)
    setCode('')
    setCodeError(null)
    resetSetup()
    beginSetup()
  }, [open, beginSetup, resetSetup])

  const busy = enable.isPending
  const stepIndex = STEP_ORDER.indexOf(step)
  const trimmedCode = code.replaceAll(' ', '')

  const goBack = () => setStep(STEP_ORDER[Math.max(0, stepIndex - 1)])
  const goNext = () => setStep(STEP_ORDER[Math.min(STEP_ORDER.length - 1, stepIndex + 1)])

  const nextDisabled = setup === null || (step === 'codes' && !acknowledged)

  return (
    <Dialog
      description={t('Step {{step}} of {{total}}', {
        step: stepIndex + 1,
        total: STEP_ORDER.length,
      })}
      footer={(
        <>
          {stepIndex > 0 ? (
            <Button disabled={busy} onClick={goBack} variant="quiet">
              {t('Back')}
            </Button>
          ) : null}
          {step === 'verify' ? (
            <Button
              aria-busy={busy}
              disabled={busy || trimmedCode.length !== TOTP_CODE_LENGTH}
              onClick={() => {
                setCodeError(null)
                enable.mutate(trimmedCode)
              }}
            >
              {t('Turn on two-factor authentication')}
            </Button>
          ) : (
            <Button disabled={nextDisabled} onClick={goNext}>
              {t('Continue')}
            </Button>
          )}
        </>
      )}
      onOpenChange={(next) => {
        if (busy && !next) return
        props.onOpenChange(next)
      }}
      open={props.open}
      size="md"
      title={t('Set up two-factor authentication')}
    >
      {initialize.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-4" role="status">
          <span className="sr-only">{t('Preparing your authenticator secret')}</span>
          <Skeleton height={208} variant="block" width={208} />
          <Skeleton height={40} variant="block" />
        </div>
      ) : null}

      {setupError !== null ? (
        <Alert
          action={(
            <Button
              aria-busy={initialize.isPending}
              disabled={initialize.isPending}
              onClick={() => {
                setSetupError(null)
                initialize.mutate()
              }}
              size="sm"
              variant="outline"
            >
              {t('Try again')}
            </Button>
          )}
          title={t('Setup could not be started')}
          tone="destructive"
        >
          {setupError}
        </Alert>
      ) : null}

      {setup === null ? null : (
        <>
          {step === 'scan' ? (
            <div className="flex flex-col gap-5">
              <p className="text-sm leading-6 text-muted">
                {t(
                  'Scan this code with an authenticator app such as 1Password, Google Authenticator or Microsoft Authenticator.',
                )}
              </p>

              <div className="flex justify-center rounded-[4px] border border-border bg-white p-4">
                <QrCode
                  fallback={(
                    <p className="max-w-xs p-6 text-center text-sm text-black">
                      {t('This code could not be drawn. Enter the setup key below by hand instead.')}
                    </p>
                  )}
                  label={t('Two-factor authentication setup code')}
                  value={setup.qr_code_data}
                />
              </div>

              <div className="flex flex-col gap-2">
                <p className="eyebrow">{t('Or enter this setup key by hand')}</p>
                <MaskedValue
                  copyLabel={t('Copy setup key')}
                  copyable
                  hideLabel={t('Hide setup key')}
                  // The kit's default mask keeps the first seven and last four
                  // characters visible, which is fine for an API key but leaks a
                  // third of a TOTP seed. Nothing about this secret is worth
                  // recognising at a glance, so it is hidden completely.
                  maskFn={() => '••••••••••••••••'}
                  showLabel={t('Reveal setup key')}
                  value={setup.secret}
                />
              </div>
            </div>
          ) : null}

          {step === 'codes' ? (
            <BackupCodes
              acknowledged={acknowledged}
              codes={setup.backup_codes}
              onAcknowledgedChange={setAcknowledged}
            />
          ) : null}

          {step === 'verify' ? (
            <div className="flex flex-col gap-4">
              <Input
                autoComplete="one-time-code"
                description={t('Enter the {{length}}-digit code your authenticator shows right now.', {
                  length: TOTP_CODE_LENGTH,
                })}
                error={codeError}
                inputClassName="mono tracking-[0.3em]"
                inputMode="numeric"
                label={t('Verification code')}
                maxLength={TOTP_CODE_LENGTH}
                onChange={(event) => {
                  setCode(event.target.value)
                  setCodeError(null)
                }}
                placeholder="000000"
                value={code}
              />

              <Alert title={t('Your other devices will be signed out')} tone="warning">
                {t(
                  'Turning on two-factor authentication ends every other session on your account. You will stay signed in here.',
                )}
              </Alert>
            </div>
          ) : null}
        </>
      )}
    </Dialog>
  )
}
