import ChartLineIcon from 'lucide-react/dist/esm/icons/chart-line'
import ChartPieIcon from 'lucide-react/dist/esm/icons/chart-pie'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { LineChart } from '@/components/chart'
import { EmptyState } from '@/components/system/EmptyState'
import { Panel } from '@/components/ui'
import { RANKING_OTHERS_LABEL, type ModelHistorySeries, type VendorShareSeries } from '@/features/rankings/api'
import {
  HISTORY_SERIES_LIMIT,
  bucketLabelAt,
  modelVolumeChart,
  vendorShareChart,
  type HistoryChart,
} from '@/features/rankings/rankings-presentation'
import { formatPercent, formatTokens } from '@/lib/format'

/**
 * Translates the one series name the server invents. `service/rankings.go` folds the tail of
 * both histories into a literal English `"Others"` constant; every other name is a real model
 * or provider and is shown exactly as the gateway spells it.
 */
function useLabelledSeries(chart: HistoryChart) {
  const { t } = useTranslation()
  const othersLabel = t('Others')
  return useMemo(
    () =>
      chart.series.map((series) => ({
        ...series,
        name: series.name === RANKING_OTHERS_LABEL ? othersLabel : series.name,
      })),
    [chart.series, othersLabel],
  )
}

/** Token volume per model over the window. */
export function ModelVolumeChart(props: { history: ModelHistorySeries | undefined; periodLabel: string }) {
  const { t } = useTranslation()
  const chart = useMemo(() => modelVolumeChart(props.history), [props.history])
  const series = useLabelledSeries(chart)
  const labels = chart.buckets.map((bucket) => bucket.label)

  return (
    <Panel>
      <Panel.Header
        description={
          chart.omitted > 0
            ? t(
                'Tokens per model over {{period}}. Showing the {{shown}} busiest of {{total}} series the server returned.',
                { period: props.periodLabel, shown: HISTORY_SERIES_LIMIT, total: HISTORY_SERIES_LIMIT + chart.omitted },
              )
            : t('Tokens per model over {{period}}.', { period: props.periodLabel })
        }
        headingLevel={2}
        icon={<ChartLineIcon aria-hidden="true" className="size-4" />}
        title={t('Traffic over time')}
      />
      <Panel.Body>
        {series.length === 0 ? (
          <EmptyState
            description={t('No traffic was recorded in this window, so there is no trend to plot.')}
            headingLevel={3}
            title={t('No history yet')}
          />
        ) : (
          <>
            <LineChart
              categoryHeader={t('Bucket')}
              formatValue={formatTokens}
              formatX={(value) => bucketLabelAt(labels, value)}
              height={260}
              label={t('Tokens per model over {{period}}', { period: props.periodLabel })}
              series={series}
              xTickCount={Math.min(6, Math.max(2, labels.length))}
            />
            <p className="mt-3 text-xs text-muted">
              {t(
                'Buckets with no traffic for a model are drawn at zero: the payload omits those points rather than sending a zero.',
              )}
            </p>
          </>
        )}
      </Panel.Body>
    </Panel>
  )
}

/** Provider share of each bucket, as reported by the server (already normalised per bucket). */
export function VendorShareChart(props: { history: VendorShareSeries | undefined; periodLabel: string }) {
  const { t } = useTranslation()
  const chart = useMemo(() => vendorShareChart(props.history), [props.history])
  const series = useLabelledSeries(chart)
  const labels = chart.buckets.map((bucket) => bucket.label)

  return (
    <Panel>
      <Panel.Header
        description={t(
          'Each provider’s share of the tokens relayed in that bucket over {{period}}. Shares within one bucket add up to 100%.',
          { period: props.periodLabel },
        )}
        headingLevel={2}
        icon={<ChartPieIcon aria-hidden="true" className="size-4" />}
        title={t('Provider share over time')}
      />
      <Panel.Body>
        {series.length === 0 ? (
          <EmptyState
            description={t('No traffic was recorded in this window, so there is no share to plot.')}
            headingLevel={3}
            title={t('No history yet')}
          />
        ) : (
          <LineChart
            categoryHeader={t('Bucket')}
            formatValue={(value: number) => formatPercent(value, 1)}
            formatX={(value) => bucketLabelAt(labels, value)}
            height={260}
            label={t('Provider share over {{period}}', { period: props.periodLabel })}
            series={series}
            xTickCount={Math.min(6, Math.max(2, labels.length))}
            yDomain={[0, 100]}
          />
        )}
      </Panel.Body>
    </Panel>
  )
}
