import { useTranslation } from 'react-i18next'

import { PageHeader } from '@/components/ui'
import { PasskeyPanel } from '@/features/profile/security/components/PasskeyPanel'
import { SessionsPanel } from '@/features/profile/security/components/SessionsPanel'
import { TwoFactorPanel } from '@/features/profile/security/components/TwoFactorPanel'

/**
 * The security half of the account centre: how you prove it is you, and where
 * that proof is currently accepted.
 *
 * Panel order is the order the decisions depend on each other. Two-factor comes
 * first because it is what the passkey panel's step-up flow needs; sessions come
 * last because changing either factor is what makes the list worth re-reading —
 * enabling 2FA, or adding or removing a passkey, signs every other session out.
 */
export function SecurityPage() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        description={t('Manage the second factors on your account and review where you are signed in.')}
        eyebrow={t('Account')}
        title={t('Security')}
      />

      <div className="flex flex-col gap-6">
        <TwoFactorPanel />
        <PasskeyPanel />
        <SessionsPanel />
      </div>
    </div>
  )
}
