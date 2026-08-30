import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/form'
import { Dialog, toErrorMessage } from '@/components/overlay'
import { Alert, Button } from '@/components/ui'
import type { SecurityProofScope, VerificationMethod } from '@/features/profile/security/api'
import {
  isPasskeyCancellation,
  proveWithPasskey,
  proveWithTotp,
} from '@/features/profile/security/step-up'

type SecurityVerificationDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Fixed by the server for the scope; see `requiredMethodFor`. Never a user choice. */
  method: VerificationMethod
  scope: SecurityProofScope
  title: string
  description: string
  /** Runs the guarded request with the freshly minted proof. Throw to keep the dialog open. */
  onVerified: (proofToken: string) => Promise<void>
}

/** `common.ValidateNumericCode` accepts exactly six digits. */
const TOTP_CODE_LENGTH = 6

/**
 * The step-up prompt that stands in front of a passkey change.
 *
 * It offers exactly ONE method, because the server accepts exactly one: giving
 * the user a choice here would mean offering a route that ends in
 * `SECURITY_PROOF_METHOD_MISMATCH`.
 *
 * The proof and the guarded request are deliberately run back to back inside one
 * handler: a proof is short-lived and single-scope, so there is nothing useful to
 * do with it if the caller is not ready to spend it immediately.
 */
export function SecurityVerificationDialog(props: SecurityVerificationDialogProps) {
  const { t } = useTranslation()

  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const { open } = props
  useEffect(() => {
    if (open) return
    setCode('')
    setError(null)
    setBusy(false)
  }, [open])

  const trimmedCode = code.replaceAll(' ', '')
  const canSubmit = props.method === 'passkey' || trimmedCode.length === TOTP_CODE_LENGTH

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const proof = props.method === 'passkey'
        ? await proveWithPasskey(props.scope)
        : await proveWithTotp(props.scope, trimmedCode)
      await props.onVerified(proof.proof_token)
      props.onOpenChange(false)
    } catch (failure: unknown) {
      setError(
        isPasskeyCancellation(failure)
          ? t('The passkey prompt was dismissed before it finished.')
          : toErrorMessage(failure),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      description={props.description}
      footer={(
        <>
          <Button disabled={busy} onClick={() => props.onOpenChange(false)} variant="quiet">
            {t('Cancel')}
          </Button>
          <Button
            aria-busy={busy}
            disabled={busy || !canSubmit}
            onClick={() => void submit()}
          >
            {props.method === 'passkey' ? t('Verify with passkey') : t('Verify')}
          </Button>
        </>
      )}
      onOpenChange={(next) => {
        if (busy && !next) return
        props.onOpenChange(next)
      }}
      open={props.open}
      size="sm"
      title={props.title}
    >
      <div className="flex flex-col gap-4">
        {props.method === 'passkey' ? (
          <p className="text-sm leading-6 text-muted">
            {t('Your browser will ask you to confirm with the passkey already on this account.')}
          </p>
        ) : (
          <Input
            autoComplete="one-time-code"
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
        )}

        {props.method === 'passkey' && error !== null ? (
          <Alert title={t('Verification did not complete')} tone="destructive">
            {error}
          </Alert>
        ) : null}
      </div>
    </Dialog>
  )
}
