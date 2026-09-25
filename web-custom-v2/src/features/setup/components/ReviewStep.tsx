import { useTranslation } from 'react-i18next'

import { DescriptionList } from '@/components/ui/DescriptionList'
import type { SetupFormValues, SetupStatus, SetupUsageMode } from '@/features/setup/api'

type ReviewStepProps = {
  status: SetupStatus
  values: SetupFormValues
}

export function ReviewStep(props: ReviewStepProps) {
  const { t } = useTranslation()

  const usageModeLabels: Record<SetupUsageMode, string> = {
    demo: t('Demo site'),
    external: t('External operation'),
    self: t('Personal use'),
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm leading-6 text-muted">
        {t(
          'Check the settings below. Initialization runs once: after it completes this page is no longer reachable.',
        )}
      </p>

      <DescriptionList
        items={[
          {
            description: (
              <span className="mono text-sm">
                {props.status.database_type === '' ? t('Unknown') : props.status.database_type}
              </span>
            ),
            id: 'database',
            term: t('Database'),
          },
          {
            description: props.status.root_init ? (
              t('The existing administrator account is kept')
            ) : (
              <span className="mono text-sm">{props.values.username.trim()}</span>
            ),
            id: 'administrator',
            term: t('Administrator username'),
          },
          {
            description: usageModeLabels[props.values.usageMode],
            id: 'usage-mode',
            term: t('Usage mode'),
          },
        ]}
        label={t('Installation summary')}
      />
    </div>
  )
}
