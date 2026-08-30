import CircleAlertIcon from 'lucide-react/dist/esm/icons/circle-alert'
import SigmaIcon from 'lucide-react/dist/esm/icons/sigma'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { toErrorMessage } from '@/components/overlay'
import { Alert, Button, SegmentedControl, type SegmentedControlOption } from '@/components/ui'
import { DATA_RANGE_IDS, type DataRangeId } from '@/features/dashboard-analytics/range'
import { METRIC_LABEL_KEYS, type AnalyticsMetric } from '@/features/dashboard-analytics/presentation'

export function useRangeLabels(): { short: Record<DataRangeId, string>; long: Record<DataRangeId, string> } {
  const { t } = useTranslation()
  return {
    short: { '24h': t('24h'), '7d': t('7d'), '30d': t('30d') },
    long: { '24h': t('24 hours'), '7d': t('7 days'), '30d': t('30 days') },
  }
}

export function RangeControl(props: { value: DataRangeId; onChange: (value: DataRangeId) => void }) {
  const { t } = useTranslation()
  const labels = useRangeLabels()
  const options: SegmentedControlOption<DataRangeId>[] = DATA_RANGE_IDS.map((id) => ({
    id,
    label: labels.short[id],
  }))

  return (
    <SegmentedControl
      label={t('Time range')}
      onChange={props.onChange}
      options={options}
      value={props.value}
    />
  )
}

export function MetricControl(props: {
  value: AnalyticsMetric
  onChange: (value: AnalyticsMetric) => void
  label?: string
}) {
  const { t } = useTranslation()
  const options: SegmentedControlOption<AnalyticsMetric>[] = [
    { id: 'quota', label: t(METRIC_LABEL_KEYS.quota) },
    { id: 'tokens', label: t(METRIC_LABEL_KEYS.tokens) },
    { id: 'requests', label: t(METRIC_LABEL_KEYS.requests) },
  ]

  return (
    <SegmentedControl
      className="shrink-0"
      label={props.label ?? t('Measure')}
      onChange={props.onChange}
      options={options}
      size="sm"
      value={props.value}
    />
  )
}

/**
 * The disclosure every derived figure on these pages carries. Nothing on the
 * two `/api/data/*` payloads is a percentage or a total, so anything shaped like
 * one was computed here and has to say so, with its formula.
 */
export function DerivationNote(props: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-xs leading-5 text-muted">
      <SigmaIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      <span>{props.children}</span>
    </p>
  )
}

export function AnalyticsErrorAlert(props: {
  title: string
  error: unknown
  isRetrying: boolean
  onRetry: () => void
}) {
  const { t } = useTranslation()

  return (
    <Alert
      action={
        <Button
          aria-busy={props.isRetrying}
          disabled={props.isRetrying}
          onClick={props.onRetry}
          size="sm"
          variant="outline"
        >
          {t('Try again')}
        </Button>
      }
      icon={<CircleAlertIcon aria-hidden="true" />}
      title={props.title}
      tone="destructive"
    >
      {toErrorMessage(props.error)}
    </Alert>
  )
}
