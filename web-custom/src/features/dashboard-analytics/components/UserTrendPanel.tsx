import { useTranslation } from 'react-i18next'

import { LineChart, formatTimeTick } from '@/components/chart'
import { EmptyState } from '@/components/system/EmptyState'
import { Panel, Skeleton } from '@/components/ui'
import { DerivationNote } from '@/features/dashboard-analytics/components/AnalyticsControls'
import { metricProjection, type AnalyticsMetric } from '@/features/dashboard-analytics/presentation'
import type { DataWindow } from '@/features/dashboard-analytics/range'
import type { UserTrend } from '@/features/dashboard-analytics/users'

const CHART_HEIGHT = 320

/**
 * Lines drawn at once. Past this the plot is unreadable and the legend longer
 * than the chart, so a wider Top-N still ranks every user in the bars above
 * while the trend keeps the leaders.
 */
export const TREND_SERIES_LIMIT = 8

type UserTrendPanelProps = {
  trends: readonly UserTrend[]
  window: DataWindow
  metric: AnalyticsMetric
  quotaPerUnit: number
  isPending: boolean
  isFetching: boolean
}

export function UserTrendPanel(props: UserTrendPanelProps) {
  const { i18n, t } = useTranslation()
  const projection = metricProjection(props.metric, props.quotaPerUnit, t)
  const anonymous = t('Unattributed')

  const shown = props.trends.slice(0, TREND_SERIES_LIMIT)
  const spanMilliseconds = (props.window.end - props.window.start) * 1000

  const series = shown.map((trend) => ({
    name: trend.username === '' ? anonymous : trend.username,
    // ChartPoint.x is plotted in unix MILLISECONDS so the time axis can label it.
    points: trend.points.map((point) => ({ x: point.x * 1000, y: projection.toValue(point) })),
  }))

  const bucketCaption =
    props.window.bucket === 'hour'
      ? t('One point per hour, in your local time zone.')
      : t('One point per day, in your local time zone.')

  return (
    <Panel>
      <Panel.Header description={bucketCaption} title={t('User consumption trend')} />
      <Panel.Body>
        {props.isPending ? (
          <Skeleton height={CHART_HEIGHT} label={t('Loading the user trend')} variant="block" />
        ) : null}

        {!props.isPending && series.length === 0 ? (
          <EmptyState
            description={t('There is no ranked user to plot over time for this range.')}
            headingLevel={3}
            title={t('No trend to show')}
          />
        ) : null}

        {!props.isPending && series.length > 0 ? (
          <div aria-busy={props.isFetching} className="flex flex-col gap-4">
            <LineChart
              categoryHeader={t('Time')}
              formatValue={projection.format}
              formatX={(value) => formatTimeTick(value, spanMilliseconds, i18n.language)}
              height={CHART_HEIGHT}
              label={t('{{measure}} per user over time', { measure: projection.label })}
              series={series}
            />
            <DerivationNote>
              {t(
                'Bucketed in this console: the hourly rows are summed into {{bucket}} buckets and zero-filled across the whole range, so an idle bucket is drawn at zero instead of being skipped. At most TREND_SERIES_LIMIT = {{limit}} users are plotted.',
                {
                  bucket: props.window.bucket === 'hour' ? t('hourly') : t('daily'),
                  limit: TREND_SERIES_LIMIT,
                },
              )}
            </DerivationNote>
          </div>
        ) : null}
      </Panel.Body>
    </Panel>
  )
}
