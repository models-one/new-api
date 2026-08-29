import RefreshCwIcon from 'lucide-react/dist/esm/icons/refresh-cw'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useTranslation } from 'react-i18next'

import { toErrorMessage } from '@/components/overlay'
import { Alert, Button } from '@/components/ui'

type UsageErrorAlertProps = {
  /** Names what failed, e.g. "Your usage could not be loaded". */
  title: string
  /** Whatever the query threw; the message is extracted by `toErrorMessage`. */
  error: unknown
  onRetry: () => void
  isRetrying: boolean
  className?: string
}

/** The visible error path every query on this page falls back to. */
export function UsageErrorAlert(props: UsageErrorAlertProps) {
  const { t } = useTranslation()

  return (
    <Alert
      action={(
        <Button
          aria-busy={props.isRetrying}
          disabled={props.isRetrying}
          onClick={props.onRetry}
          size="sm"
          variant="outline"
        >
          <RefreshCwIcon aria-hidden="true" />
          {t('Try again')}
        </Button>
      )}
      className={props.className}
      icon={<TriangleAlertIcon />}
      title={props.title}
      tone="destructive"
    >
      {toErrorMessage(props.error)}
    </Alert>
  )
}
