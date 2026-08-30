import { useQuery } from '@tanstack/react-query'
import KeySquareIcon from 'lucide-react/dist/esm/icons/key-square'
import RefreshCwIcon from 'lucide-react/dist/esm/icons/refresh-cw'
import ShieldCheckIcon from 'lucide-react/dist/esm/icons/shield-check'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { toErrorMessage } from '@/components/overlay'
import { Alert, Button, IconBadge, Panel, Skeleton, StatusBadge } from '@/components/ui'
import { twoFactorStatusQuery } from '@/features/profile/security/api'
import { BackupCodesDialog } from '@/features/profile/security/components/BackupCodesDialog'
import { TwoFactorDisableDialog } from '@/features/profile/security/components/TwoFactorDisableDialog'
import { TwoFactorSetupDialog } from '@/features/profile/security/components/TwoFactorSetupDialog'

/**
 * `common.MaxFailAttempts` / `common.LockoutDuration`: five bad codes lock the
 * second factor for five minutes. The server reports the state, not the numbers,
 * so the copy stays qualitative.
 */
export function TwoFactorPanel() {
  const { t } = useTranslation()
  const statusQuery = useQuery(twoFactorStatusQuery())

  const [setupOpen, setSetupOpen] = useState(false)
  const [disableOpen, setDisableOpen] = useState(false)
  const [backupOpen, setBackupOpen] = useState(false)

  const status = statusQuery.data
  const remaining = status?.backup_codes_remaining

  return (
    <Panel>
      <Panel.Header
        description={t('A code from your authenticator app, on top of your password.')}
        icon={<IconBadge icon={<ShieldCheckIcon aria-hidden="true" />} size="sm" tone="success" />}
        title={t('Two-factor authentication')}
      />

      <Panel.Body className="flex flex-col gap-5">
        {statusQuery.isPending ? (
          <div aria-busy="true" className="flex flex-col gap-3" role="status">
            <span className="sr-only">{t('Loading two-factor status')}</span>
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
            title={t('Two-factor status could not be loaded')}
            tone="destructive"
          >
            {toErrorMessage(statusQuery.error)}
          </Alert>
        ) : null}

        {status ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={status.enabled ? 'success' : 'muted'}>
                {status.enabled ? t('On') : t('Off')}
              </StatusBadge>
              {status.locked ? (
                <StatusBadge tone="destructive">{t('Temporarily locked')}</StatusBadge>
              ) : null}
            </div>

            {status.locked ? (
              <Alert title={t('Too many incorrect codes')} tone="destructive">
                {t(
                  'Two-factor verification is locked for a few minutes. Wait for it to clear, then try again.',
                )}
              </Alert>
            ) : null}

            {status.enabled ? (
              <>
                <p className="text-sm leading-6 text-muted">
                  {remaining === undefined
                    ? t('Backup codes are in place for this account.')
                    : t('{{count}} backup codes left', { count: remaining })}
                </p>

                {remaining !== undefined && remaining === 0 ? (
                  <Alert title={t('No backup codes left')} tone="warning">
                    {t(
                      'If you lose your authenticator you will not be able to sign in. Generate a new set now.',
                    )}
                  </Alert>
                ) : null}

                <div className="flex flex-wrap gap-3">
                  <Button onClick={() => setBackupOpen(true)} variant="outline">
                    <RefreshCwIcon aria-hidden="true" />
                    {t('Replace backup codes')}
                  </Button>
                  <Button onClick={() => setDisableOpen(true)} variant="danger">
                    {t('Turn off')}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm leading-6 text-muted">
                  {t(
                    'Without a second factor, anyone who learns your password can sign in as you.',
                  )}
                </p>
                <div>
                  <Button onClick={() => setSetupOpen(true)}>
                    <KeySquareIcon aria-hidden="true" />
                    {t('Turn on two-factor authentication')}
                  </Button>
                </div>
              </>
            )}
          </>
        ) : null}
      </Panel.Body>

      <TwoFactorSetupDialog onOpenChange={setSetupOpen} open={setupOpen} />
      <TwoFactorDisableDialog onOpenChange={setDisableOpen} open={disableOpen} />
      <BackupCodesDialog onOpenChange={setBackupOpen} open={backupOpen} />
    </Panel>
  )
}
