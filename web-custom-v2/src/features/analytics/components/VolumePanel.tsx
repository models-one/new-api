import { useTranslation } from 'react-i18next'

import { AreaChart, formatTimeTick } from '@/components/chart'
import { EmptyState } from '@/components/system/EmptyState'
import { Panel, SegmentedControl, Skeleton, type SegmentedControlOption } from '@/components/ui'
import type { AnalyticsWindow } from '@/features/analytics/range'
import type { SeriesPoint } from '@/lib/api/usage-data'
import { formatCompactNumber, formatCurrency, formatTokens, quotaToCurrency } from '@/lib/format'

export type VolumeMetric = 'requests' | 'tokens' | 'spend'

type VolumePanelProps = {
  buckets: readonly SeriesPoint[]
  metric: VolumeMetric
  onMetricChange: (metric: VolumeMetric) => void
  window: AnalyticsWindow
  quotaPerUnit: number
  /** True when the window returned no usage rows at all. */
  isEmpty: boolean
  isPending: boolean
  isFetching: boolean
}

const CHART_HEIGHT = 340

export function VolumePanel(props: VolumePanelProps) {
  const { i18n, t } = useTranslation()

  const metricOptions: SegmentedControlOption<VolumeMetric>[] = [
    { id: 'requests', label: t('Requests') },
    { id: 'tokens', label: t('Tokens') },
    { id: 'spend', label: t('Spend') },
  ]

  const metricLabels: Record<VolumeMetric, string> = {
    requests: t('Requests'),
    tokens: t('Tokens'),
    spend: t('Spend'),
  }

  const metricValue = (bucket: SeriesPoint): number => {
    if (props.metric === 'requests') return bucket.requests
    if (props.metric === 'tokens') return bucket.tokens
    return quotaToCurrency(bucket.quota, props.quotaPerUnit)
  }

  const formatValue = (value: number): string => {
    if (props.metric === 'requests') return formatCompactNumber(value)
    if (props.metric === 'tokens') return formatTokens(value)
    return formatCurrency(value)
  }

  // ChartPoint.x is plotted as unix milliseconds so the time axis can label it.
  const points = props.buckets.map((bucket) => ({ x: bucket.x * 1000, y: metricValue(bucket) }))
  const spanMilliseconds = (props.window.end - props.window.start) * 1000

  const bucketCaption =
    props.window.bucket === 'hour'
      ? t('One point per hour, in your local time zone.')
      : t('One point per day, in your local time zone.')

  return (
    <Panel className="flex flex-col p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-bold">{t('Your usage over time')}</h2>
          <p className="mt-1 text-sm text-muted">{bucketCaption}</p>
        </div>
        <SegmentedControl
          className="shrink-0"
          label={t('Usage metric')}
          onChange={props.onMetricChange}
          options={metricOptions}
          size="sm"
          value={props.metric}
        />
      </div>

      <div aria-busy={props.isFetching} className="mt-7">
        {props.isPending ? (
          <Skeleton
            height={CHART_HEIGHT}
            label={t('Loading your usage chart')}
            variant="block"
          />
        ) : null}

        {!props.isPending && props.isEmpty ? (
          <EmptyState
            description={t('Nothing was recorded for your account in this range.')}
            headingLevel={3}
            title={t('No usage in this range')}
          />
        ) : null}

        {!props.isPending && !props.isEmpty ? (
          <AreaChart
            categoryHeader={t('Time')}
            formatValue={formatValue}
            formatX={(value) => formatTimeTick(value, spanMilliseconds, i18n.language)}
            height={CHART_HEIGHT}
            label={t('Your usage over time')}
            series={[{ name: metricLabels[props.metric], points }]}
            showLegend={false}
          />
        ) : null}
      </div>
    </Panel>
  )
}
