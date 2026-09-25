import { useQuery } from '@tanstack/react-query'
import GaugeIcon from 'lucide-react/dist/esm/icons/gauge'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Sparkline } from '@/components/chart'
import { DataTable, useDataTable, type DataTableColumns } from '@/components/data'
import { toErrorMessage } from '@/components/overlay'
import { EmptyState } from '@/components/system/EmptyState'
import { Alert, Button, Panel, Skeleton } from '@/components/ui'
import {
  PERF_METRICS_HOURS,
  averageAcrossGroups,
  formatThroughput,
  modelPerfMetricsQuery,
  successRateSeries,
  type PerfGroupMetrics,
} from '@/features/pricing/perf-metrics'
import { formatLatencyMs, formatPercent, formatTime } from '@/lib/format'

const ALL_ROWS = 200

type Cell = { row: { original: PerfGroupMetrics } }

/**
 * Relay performance for one model, from `GET /api/perf-metrics`.
 *
 * Every figure here is aggregated across ALL traffic this gateway relayed for the model, not
 * the viewer's own — the panel says so in its own description, because the same numbers on a
 * signed-in dashboard would mean something completely different.
 */
export function ModelPerformancePanel(props: { modelName: string }) {
  const { t } = useTranslation()
  const metrics = useQuery(modelPerfMetricsQuery(props.modelName))

  const groups = useMemo(() => metrics.data?.groups ?? [], [metrics.data])
  const totals = useMemo(() => averageAcrossGroups(groups), [groups])
  const series = useMemo(() => successRateSeries(groups), [groups])

  const columns = useMemo<DataTableColumns<PerfGroupMetrics>>(
    () => [
      {
        id: 'group',
        header: t('Group'),
        cell: ({ row }: Cell) => row.original.group,
        meta: { label: t('Group'), mono: true, mobilePrimary: true },
      },
      {
        id: 'tps',
        header: t('Throughput'),
        cell: ({ row }: Cell) => formatThroughput(row.original.avg_tps),
        meta: { label: t('Throughput'), align: 'right' as const, mono: true },
      },
      {
        id: 'ttft',
        header: t('Time to first token'),
        cell: ({ row }: Cell) => formatLatencyMs(row.original.avg_ttft_ms),
        meta: { label: t('Time to first token'), align: 'right' as const, mono: true },
      },
      {
        id: 'latency',
        header: t('Average latency'),
        cell: ({ row }: Cell) => formatLatencyMs(row.original.avg_latency_ms),
        meta: { label: t('Average latency'), align: 'right' as const, mono: true },
      },
      {
        id: 'success',
        header: t('Success rate'),
        cell: ({ row }: Cell) => formatPercent(row.original.success_rate, 2),
        meta: { label: t('Success rate'), align: 'right' as const, mono: true },
      },
    ],
    [t],
  )

  const { table } = useDataTable<PerfGroupMetrics>({
    columns,
    data: groups,
    defaultPageSize: ALL_ROWS,
    getRowId: (row) => row.group,
    total: groups.length,
  })

  return (
    <Panel>
      <Panel.Header
        description={t(
          'Measured across all traffic this gateway relayed for this model in the last {{hours}} hours — not your own usage.',
          { hours: PERF_METRICS_HOURS },
        )}
        headingLevel={2}
        title={t('Service performance')}
      />
      <Panel.Body className="flex flex-col gap-5" padded={false}>
        {metrics.isLoading ? (
          <div className="px-5 py-4">
            <Skeleton className="h-40" label={t('Loading performance metrics')} variant="block" />
          </div>
        ) : null}

        {metrics.isError ? (
          <div className="px-5 py-4">
            <Alert
              action={
                <Button
                  aria-busy={metrics.isFetching}
                  disabled={metrics.isFetching}
                  onClick={() => void metrics.refetch()}
                  variant="outline"
                >
                  {t('Try again')}
                </Button>
              }
              icon={<TriangleAlertIcon aria-hidden="true" />}
              title={t('Could not load performance metrics')}
              tone="destructive"
            >
              {toErrorMessage(metrics.error)}
            </Alert>
          </div>
        ) : null}

        {metrics.isSuccess && groups.length === 0 ? (
          <EmptyState
            description={t(
              'This gateway has recorded no relays for this model in the last {{hours}} hours.',
              { hours: PERF_METRICS_HOURS },
            )}
            headingLevel={3}
            title={t('No performance data yet')}
          />
        ) : null}

        {totals === undefined ? null : (
          <>
            <dl className="grid gap-3 px-5 pt-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="field flex flex-col gap-1 p-3">
                <dt className="eyebrow">{t('Throughput')}</dt>
                <dd className="mono text-lg font-semibold text-foreground">
                  {formatThroughput(totals.avgTps)}
                </dd>
              </div>
              <div className="field flex flex-col gap-1 p-3">
                <dt className="eyebrow">{t('Time to first token')}</dt>
                <dd className="mono text-lg font-semibold text-foreground">
                  {formatLatencyMs(totals.avgTtftMs)}
                </dd>
              </div>
              <div className="field flex flex-col gap-1 p-3">
                <dt className="eyebrow">{t('Average latency')}</dt>
                <dd className="mono text-lg font-semibold text-foreground">
                  {formatLatencyMs(totals.avgLatencyMs)}
                </dd>
              </div>
              <div className="field flex flex-col gap-1 p-3">
                <dt className="eyebrow">{t('Success rate')}</dt>
                <dd className="mono text-lg font-semibold text-foreground">
                  {formatPercent(totals.successRate, 2)}
                </dd>
              </div>
            </dl>

            {series.length > 1 ? (
              <div className="px-5">
                <p className="eyebrow mb-2 flex items-center gap-2">
                  <GaugeIcon aria-hidden="true" className="size-3.5" />
                  {t('Success rate trend')}
                </p>
                <Sparkline
                  categoryHeader={t('Bucket')}
                  formatValue={(value) => formatPercent(value, 2)}
                  formatX={(value) => formatTime(value)}
                  height={64}
                  label={t('Service-wide success rate over the last {{hours}} hours', {
                    hours: PERF_METRICS_HOURS,
                  })}
                  points={series}
                  showLastPoint
                  tone="success"
                  valueLabel={t('Success rate')}
                />
              </div>
            ) : null}

            <DataTable
              emptyDescription={t('No group reported traffic in this window.')}
              emptyTitle={t('No performance data yet')}
              label={t('Performance by pricing group')}
              minWidthClassName="min-w-[640px]"
              table={table}
            />
          </>
        )}
      </Panel.Body>
    </Panel>
  )
}
