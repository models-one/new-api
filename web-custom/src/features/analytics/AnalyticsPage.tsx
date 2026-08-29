import CircleAlertIcon from 'lucide-react/dist/esm/icons/circle-alert'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { toErrorMessage } from '@/components/overlay'
import { Alert, Button, PageHeader, SegmentedControl, type SegmentedControlOption } from '@/components/ui'
import { ModelTokenPanel } from '@/features/analytics/components/ModelTokenPanel'
import { PlatformHealthPanel } from '@/features/analytics/components/PlatformHealthPanel'
import { UsageSummary, UsageSummarySkeleton } from '@/features/analytics/components/UsageSummary'
import { VolumePanel, type VolumeMetric } from '@/features/analytics/components/VolumePanel'
import {
  ANALYTICS_RANGE_IDS,
  alignedWindowEnd,
  resolveAnalyticsWindow,
  type AnalyticsRangeId,
} from '@/features/analytics/range'
import { buildModelShares, buildVolumeSeries, sumUsage } from '@/features/analytics/usage'
import { useQuotaPerUnit, useServerStatus } from '@/hooks/use-server-status'
import { perfSummaryQuery } from '@/lib/api/metrics'
import { selfQuotaDataQuery } from '@/lib/api/usage-data'

export function AnalyticsPage() {
  const { t } = useTranslation()
  const [rangeId, setRangeId] = useState<AnalyticsRangeId>('7d')
  const [metric, setMetric] = useState<VolumeMetric>('requests')

  // Recomputed every render but pinned to a 5 minute grid, so the query keys
  // below stay stable instead of changing on each pass.
  const analyticsWindow = resolveAnalyticsWindow(rangeId, alignedWindowEnd())

  const usageQuery = useQuery(selfQuotaDataQuery(analyticsWindow.start, analyticsWindow.end))
  const previousUsageQuery = useQuery(
    selfQuotaDataQuery(analyticsWindow.previousStart, analyticsWindow.previousEnd),
  )
  const perfQuery = useQuery(perfSummaryQuery(analyticsWindow.hours))

  const { data: serverStatus } = useServerStatus()
  const quotaPerUnit = useQuotaPerUnit()

  const rangeLabels: Record<AnalyticsRangeId, string> = {
    '24h': t('24h'),
    '7d': t('7d'),
    '30d': t('30d'),
  }
  const rangeCaptions: Record<AnalyticsRangeId, string> = {
    '24h': t('24 hours'),
    '7d': t('7 days'),
    '30d': t('30 days'),
  }
  const rangeOptions: SegmentedControlOption<AnalyticsRangeId>[] = ANALYTICS_RANGE_IDS.map(
    (id) => ({ id, label: rangeLabels[id] }),
  )

  const points = usageQuery.data ?? []
  const totals = sumUsage(points)
  const previousTotals = previousUsageQuery.data
    ? sumUsage(previousUsageQuery.data)
    : undefined
  const buckets = buildVolumeSeries(points, analyticsWindow)
  const shares = buildModelShares(points)

  const comparisonCaption = t('vs previous {{range}}', { range: rangeCaptions[rangeId] })
  const hasBaseline =
    previousTotals !== undefined
    && (previousTotals.requests > 0 || previousTotals.tokens > 0 || previousTotals.quota > 0)

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        action={
          <SegmentedControl
            label={t('Analytics range')}
            onChange={setRangeId}
            options={rangeOptions}
            value={rangeId}
          />
        }
        description={t(
          'Your own requests, tokens and spend for the selected range, alongside service-wide model performance.',
        )}
        title={t('Advanced analytics')}
      />

      {serverStatus?.enable_data_export === false ? (
        <Alert icon={<TriangleAlertIcon />} title={t('Usage collection is turned off')} tone="warning">
          {t(
            'This server has usage data collection disabled, so no per-model usage is recorded and the charts below stay empty.',
          )}
        </Alert>
      ) : null}

      {usageQuery.isError ? (
        <Alert
          action={
            <Button
              aria-busy={usageQuery.isFetching}
              disabled={usageQuery.isFetching}
              onClick={() => void usageQuery.refetch()}
              size="sm"
              variant="outline"
            >
              {t('Try again')}
            </Button>
          }
          icon={<CircleAlertIcon />}
          title={t('Your usage data could not be loaded')}
          tone="destructive"
        >
          {toErrorMessage(usageQuery.error)}
        </Alert>
      ) : null}

      {usageQuery.isError ? null : (
        <>
          <div className="flex flex-col gap-3">
            {usageQuery.isPending ? (
              <UsageSummarySkeleton />
            ) : (
              <UsageSummary
                comparisonCaption={comparisonCaption}
                isFetching={usageQuery.isFetching || previousUsageQuery.isFetching}
                previousTotals={previousTotals}
                quotaPerUnit={quotaPerUnit}
                totals={totals}
              />
            )}

            {!usageQuery.isPending && previousUsageQuery.isSuccess && !hasBaseline ? (
              <p className="text-xs leading-5 text-muted">
                {t('No change is shown because nothing was recorded in the previous {{range}}.', {
                  range: rangeCaptions[rangeId],
                })}
              </p>
            ) : null}

            {/* A failed baseline is not an empty baseline, so it gets its own wording. */}
            {!usageQuery.isPending && previousUsageQuery.isError ? (
              <p className="text-xs leading-5 text-muted">
                {t('No change is shown because the previous {{range}} could not be loaded.', {
                  range: rangeCaptions[rangeId],
                })}
              </p>
            ) : null}
          </div>

          <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
            <VolumePanel
              buckets={buckets}
              isEmpty={points.length === 0}
              isFetching={usageQuery.isFetching}
              isPending={usageQuery.isPending}
              metric={metric}
              onMetricChange={setMetric}
              quotaPerUnit={quotaPerUnit}
              window={analyticsWindow}
            />

            <ModelTokenPanel
              isFetching={usageQuery.isFetching}
              isPending={usageQuery.isPending}
              shares={shares}
            />
          </div>
        </>
      )}

      <PlatformHealthPanel
        errorMessage={toErrorMessage(perfQuery.error)}
        isError={perfQuery.isError}
        isFetching={perfQuery.isFetching}
        isPending={perfQuery.isPending}
        models={perfQuery.data?.models ?? []}
        onRetry={() => void perfQuery.refetch()}
        rangeCaption={rangeCaptions[rangeId]}
      />
    </div>
  )
}
