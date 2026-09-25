import ShieldAlertIcon from 'lucide-react/dist/esm/icons/shield-alert'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useTranslation } from 'react-i18next'

import { toErrorMessage } from '@/components/overlay'
import { Alert, Button, PageHeader } from '@/components/ui'
import { InstancesPanel } from '@/features/system-info/components/InstancesPanel'
import { LogFilesPanel } from '@/features/system-info/components/LogFilesPanel'
import { ModelPerformancePanel } from '@/features/system-info/components/ModelPerformancePanel'
import { PerformancePanel } from '@/features/system-info/components/PerformancePanel'
import { useRootAccess } from '@/features/system-info/root-access'

export function SystemInfoPage() {
  const { t } = useTranslation()
  const access = useRootAccess()

  if (access.state === 'checking') {
    return (
      <div aria-busy="true" className="flex flex-col gap-8" role="status">
        <span className="sr-only">{t('Checking your permissions')}</span>
        <PageHeader
          description={t('Every node that has sent a heartbeat, and the runtime of whichever node answers this page.')}
          eyebrow={t('Root only')}
          title={t('Deployment health')}
        />
      </div>
    )
  }

  if (access.state === 'unavailable') {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader
          description={t('Every node that has sent a heartbeat, and the runtime of whichever node answers this page.')}
          eyebrow={t('Root only')}
          title={t('Deployment health')}
        />
        <Alert
          action={
            <Button
              aria-busy={access.isRefetching}
              disabled={access.isRefetching}
              onClick={access.retry}
              variant="outline"
            >
              {t('Try again')}
            </Button>
          }
          icon={<TriangleAlertIcon aria-hidden="true" />}
          title={t('Could not confirm your permissions')}
          tone="destructive"
        >
          {toErrorMessage(access.error)}
        </Alert>
      </div>
    )
  }

  if (access.state === 'denied') {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader
          description={t('Every node that has sent a heartbeat, and the runtime of whichever node answers this page.')}
          eyebrow={t('Root only')}
          title={t('Deployment health')}
        />
        <Alert
          icon={<ShieldAlertIcon aria-hidden="true" />}
          title={t('Root access required')}
          tone="warning"
        >
          {t('The instance and runtime endpoints sit behind RootAuth, which admits role 100 only — an administrator at role 10 is refused exactly like anyone else. Nothing on this page has anything to show for your account.')}
        </Alert>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        description={t('Every node that has sent a heartbeat, and the runtime of whichever node answers this page.')}
        eyebrow={t('Root only')}
        title={t('Deployment health')}
      />

      <div className="flex flex-col gap-6">
        <InstancesPanel />
        <PerformancePanel />
        <LogFilesPanel />
        <ModelPerformancePanel />
      </div>
    </div>
  )
}
