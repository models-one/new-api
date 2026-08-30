import { useQuery, useQueryClient } from '@tanstack/react-query'
import FingerprintIcon from 'lucide-react/dist/esm/icons/fingerprint'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog, toErrorMessage, toast } from '@/components/overlay'
import { Alert, Button, IconBadge, Panel, Skeleton, StatusBadge } from '@/components/ui'
import { isPasskeySupported } from '@/features/auth/passkey'
import { useAuthServerConfig } from '@/features/auth/server-config'
import {
  passkeyStatusQuery,
  removePasskey,
  securityProofFailure,
  twoFactorStatusQuery,
  type SecurityProofScope,
  type VerificationMethod,
} from '@/features/profile/security/api'
import { SecurityVerificationDialog } from '@/features/profile/security/components/SecurityVerificationDialog'
import { registerPasskey } from '@/features/profile/security/passkey-ceremony'
import { isPasskeyCancellation, requiredMethodFor } from '@/features/profile/security/step-up'

type PendingVerification = {
  scope: SecurityProofScope
  method: VerificationMethod
}

/**
 * Passkey enrolment and removal.
 *
 * Three separate facts decide what this panel offers, and none of them can stand
 * in for another:
 *   - `GET /api/status`.passkey_login — the operator switch. With it off, every
 *     passkey endpoint answers "administrator has not enabled Passkey login",
 *     so the panel says so rather than presenting a button that always fails.
 *   - `isPasskeySupported()` — whether this browser can run the ceremony at all.
 *   - `GET /api/user/passkey`.enabled — whether a credential is already bound.
 *
 * The account holds at most ONE passkey: `model.UpsertPasskeyCredential...`
 * replaces it, and the status endpoint is a boolean, not a list. The copy is
 * written in the singular for that reason.
 */
export function PasskeyPanel() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { config, isPending: configPending } = useAuthServerConfig()

  const statusQuery = useQuery(passkeyStatusQuery())
  const twoFactorQuery = useQuery(twoFactorStatusQuery())

  const [supported, setSupported] = useState<boolean | null>(null)
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false)
  const [pending, setPending] = useState<PendingVerification | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    isPasskeySupported()
      .then((result) => { if (active) setSupported(result) })
      .catch(() => { if (active) setSupported(false) })
    return () => { active = false }
  }, [])

  const enabled = statusQuery.data?.enabled === true
  const twoFactorEnabled = twoFactorQuery.data?.enabled === true
  const lastUsedAt = statusQuery.data?.last_used_at

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['profile', 'security'] })

  /**
   * Runs a guarded action, and escalates to the step-up dialog when the server
   * asks for a proof. The requirement is computed up front from the 2FA and
   * passkey state, but the 403 branch stays: the two queries can be stale, and
   * `middleware.RequireSecurityProof` is the only authority on the answer.
   */
  const runGuarded = async (
    scope: SecurityProofScope,
    action: (proofToken?: string) => Promise<void>,
    onDone: () => void,
  ) => {
    const requirement = requiredMethodFor(scope, { twoFactorEnabled, passkeyEnabled: enabled })
    if (requirement.kind === 'method') {
      setPending({ scope, method: requirement.method })
      return
    }

    setBusy(true)
    setError(null)
    try {
      await action()
      onDone()
      await refresh()
    } catch (failure: unknown) {
      const proofCode = securityProofFailure(failure)
      if (proofCode !== null) {
        setPending({ scope, method: twoFactorEnabled ? '2fa' : 'passkey' })
        return
      }
      if (isPasskeyCancellation(failure)) {
        setError(t('The passkey prompt was dismissed before it finished.'))
        return
      }
      setError(toErrorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  const startRegistration = () => {
    setConfirmRemoveOpen(false)
    void runGuarded(
      'passkey.register',
      (proofToken) => registerPasskey(proofToken),
      () => toast.success(t('Passkey added')),
    )
  }

  const startRemoval = () => {
    setConfirmRemoveOpen(false)
    void runGuarded(
      'passkey.delete',
      async (proofToken) => { await removePasskey(proofToken) },
      () => toast.success(t('Passkey removed')),
    )
  }

  const verificationCopy = pending?.scope === 'passkey.register'
    ? {
      title: t('Confirm it is you'),
      description: t('Enter a code from your authenticator before adding a passkey.'),
    }
    : {
      title: t('Confirm it is you'),
      description: pending?.method === 'passkey'
        ? t('Confirm with the passkey you are about to remove.')
        : t('Enter a code from your authenticator before removing your passkey.'),
    }

  const loading = statusQuery.isPending || twoFactorQuery.isPending || configPending

  return (
    <Panel>
      <Panel.Header
        description={t('Sign in with a fingerprint, a face scan or a security key instead of a password.')}
        icon={<IconBadge icon={<FingerprintIcon aria-hidden="true" />} size="sm" tone="info" />}
        title={t('Passkey')}
      />

      <Panel.Body className="flex flex-col gap-5">
        {loading ? (
          <div aria-busy="true" className="flex flex-col gap-3" role="status">
            <span className="sr-only">{t('Loading passkey status')}</span>
            <Skeleton height={24} variant="block" width="12rem" />
            <Skeleton height={40} variant="block" />
          </div>
        ) : null}

        {statusQuery.isError ? (
          <Alert
            action={(
              <Button
                aria-busy={statusQuery.isFetching}
                disabled={statusQuery.isFetching}
                onClick={() => void statusQuery.refetch()}
                size="sm"
                variant="outline"
              >
                {t('Try again')}
              </Button>
            )}
            title={t('Passkey status could not be loaded')}
            tone="destructive"
          >
            {toErrorMessage(statusQuery.error)}
          </Alert>
        ) : null}

        {loading || statusQuery.isError ? null : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={enabled ? 'success' : 'muted'}>
                {enabled ? t('Registered') : t('Not registered')}
              </StatusBadge>
            </div>

            {enabled ? (
              <p className="text-sm leading-6 text-muted">
                {lastUsedAt
                  ? t('Last used to sign in on {{date}}', {
                    date: new Date(lastUsedAt).toLocaleString(),
                  })
                  : t('This passkey has not been used to sign in yet.')}
              </p>
            ) : null}

            {!config.passkeyLoginEnabled ? (
              <Alert title={t('Passkeys are turned off for this site')} tone="info">
                {t('An administrator has to enable passkey sign-in before you can register one.')}
              </Alert>
            ) : null}

            {config.passkeyLoginEnabled && supported === false ? (
              <Alert title={t('This device cannot use passkeys')} tone="warning">
                {t(
                  'Use a browser and device with biometric unlock or a security key to register a passkey.',
                )}
              </Alert>
            ) : null}

            {error !== null ? (
              <Alert
                dismissLabel={t('Dismiss')}
                dismissible
                onDismiss={() => setError(null)}
                title={t('That did not work')}
                tone="destructive"
              >
                {error}
              </Alert>
            ) : null}

            <div className="flex flex-wrap gap-3">
              {enabled ? (
                <Button
                  aria-busy={busy}
                  disabled={busy}
                  onClick={() => setConfirmRemoveOpen(true)}
                  variant="danger"
                >
                  {t('Remove passkey')}
                </Button>
              ) : (
                <Button
                  aria-busy={busy}
                  disabled={busy || !config.passkeyLoginEnabled || supported !== true}
                  onClick={startRegistration}
                >
                  {t('Add a passkey')}
                </Button>
              )}
            </div>
          </>
        )}
      </Panel.Body>

      <ConfirmDialog
        cancelLabel={t('Keep it')}
        confirmLabel={t('Remove passkey')}
        description={t(
          'You will need your password to sign in again. You can register a new passkey at any time.',
        )}
        destructive
        isLoading={busy}
        onConfirm={startRemoval}
        onOpenChange={setConfirmRemoveOpen}
        open={confirmRemoveOpen}
        title={t('Remove this passkey?')}
      />

      {pending === null ? null : (
        <SecurityVerificationDialog
          description={verificationCopy.description}
          method={pending.method}
          onOpenChange={(next) => { if (!next) setPending(null) }}
          onVerified={async (proofToken) => {
            if (pending.scope === 'passkey.register') {
              await registerPasskey(proofToken)
              toast.success(t('Passkey added'))
            } else {
              await removePasskey(proofToken)
              toast.success(t('Passkey removed'))
            }
            // The dialog closes itself on success, and its onOpenChange clears
            // `pending`; clearing it here would unmount the dialog mid-await.
            await refresh()
          }}
          open
          scope={pending.scope}
          title={verificationCopy.title}
        />
      )}
    </Panel>
  )
}
