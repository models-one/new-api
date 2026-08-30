import { useTranslation } from 'react-i18next'

import { PageHeader } from '@/components/ui'
import { LanguagePanel } from '@/features/profile/preferences/components/LanguagePanel'
import { NotificationPanel } from '@/features/profile/preferences/components/NotificationPanel'

/**
 * The preferences half of the account centre.
 *
 * Both panels write to the same `setting` column through different endpoints,
 * and one of them overwrites the other (see `preferences/api.ts`). Keeping them
 * on one page is deliberate: it is the only place that interaction is visible.
 */
export function PreferencesPage() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        description={t('Choose how this console talks to you and where alerts are sent.')}
        eyebrow={t('Account')}
        title={t('Preferences')}
      />

      <div className="flex flex-col gap-6">
        <NotificationPanel />
        <LanguagePanel />
      </div>
    </div>
  )
}
