import { useQuery, useQueryClient } from '@tanstack/react-query'
import GaugeIcon from 'lucide-react/dist/esm/icons/gauge'
import HeartPulseIcon from 'lucide-react/dist/esm/icons/heart-pulse'
import TimerIcon from 'lucide-react/dist/esm/icons/timer'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Sparkline } from '@/components/chart'
import {
  DataTable,
  DataTableColumnHeader,
  MobileCardList,
  MonoCell,
  useDataTable,
  type DataTableColumns,
} from '@/components/data'
import { toErrorMessage } from '@/components/overlay'
import {
  Alert,
  Button,
  Panel,
  SegmentedControl,
  StatCard,
  StatusBadge,
  type SegmentedControlOption,
} from '@/components/ui'
import { PollStatus } from '@/features/system-info/components/PollStatus'
import {
  DEFAULT_PERFORMANCE_WINDOW_HOURS,
  formatSuccessRate,
  formatThroughput,
  rollupModelPerformance,
  SUCCESS_RATE_GOOD_MIN,
  SUCCESS_RATE_LABEL,
  SUCCESS_RATE_WARNING_MIN,
  successRateLevel,
  successRateTone,
  type PerformanceWindowHours,
} from '@/features/system-info/model-performance'
import { perfSummaryQuery, type ModelPerfSummary } from '@/lib/api/metrics'
import { formatLatencyMs } from '@/lib/format'

/** Labels for the window picker. The values are the `hours` the endpoint takes. */
const WINDOW_OPTIONS: { hours: PerformanceWindowHours; labelKey: string }[] = [
  { hours: 1, labelKey: '1h' },
  { hours: 6, labelKey: '6h' },
  { hours: 24, labelKey: '24h' },
  { hours: 168, labelKey: '7d' },
  { hours: 720, labelKey: '30d' },
]

export function ModelPerformancePanel() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [hours, setHours] = useState<PerformanceWindowHours>(DEFAULT_PERFORMANCE_WINDOW_HOURS)

  const summaryQuery = useQuery(perfSummaryQuery(hours))
  const models = useMemo(() => summaryQuery.data?.models ?? [], [summaryQuery.data])
  const rollup = rollupModelPerformance(models)

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['perf-metrics', 'summary'] })
  }

  const columns = useMemo<DataTableColumns<ModelPerfSummary>>(
    () => [
      {
        cell: ({ row }) => <MonoCell value={row.original.model_name} />,
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Model')} />,
        id: 'model',
        meta: { label: t('Model'), mobilePrimary: true, mono: true },
      },
      {
        cell: ({ row }) => {
          const rate = row.original.success_rate
          return (
            <StatusBadge tone={successRateTone(rate)}>
              <span className="mono">{formatSuccessRate(rate)}</span>
              <span aria-hidden="true">·</span>
              <span>{t(SUCCESS_RATE_LABEL[successRateLevel(rate)])}</span>
            </StatusBadge>
          )
        },
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Success rate')} />,
        id: 'success_rate',
        meta: { label: t('Success rate') },
      },
      {
        cell: ({ row }) => {
          const rates = row.original.recent_success_rates ?? []
          if (rates.length === 0) {
            return <MonoCell value={undefined} />
          }
          return (
            <Sparkline
              className="w-28"
              formatValue={(value) => formatSuccessRate(value)}
              height={28}
              label={t('Recent success rate for {{model}}', { model: row.original.model_name })}
              points={rates.map((value, index) => ({ x: index, y: value }))}
              showLastPoint
              tone={successRateTone(row.original.success_rate)}
              valueLabel={t('Success rate')}
            />
          )
        },
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Recent buckets')} />
        ),
        id: 'recent',
        meta: { hideOnMobile: true, label: t('Recent buckets') },
      },
      {
        cell: ({ row }) => (
          <MonoCell align="right" value={formatLatencyMs(row.original.avg_latency_ms)} />
        ),
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Avg latency')} />,
        id: 'latency',
        meta: { align: 'right', label: t('Avg latency'), mono: true },
      },
      {
        cell: ({ row }) => (
          <MonoCell align="right" value={formatThroughput(row.original.avg_tps)} />
        ),
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Throughput')} />,
        id: 'throughput',
        meta: { align: 'right', label: t('Throughput'), mono: true },
      },
    ],
    [t],
  )

  const { table } = useDataTable<ModelPerfSummary>({
    columns,
    data: summaryQuery.data?.models,
    getRowId: (row) => row.model_name,
  })

  const windowOptions: SegmentedControlOption[] = WINDOW_OPTIONS.map((option) => ({
    id: String(option.hours),
    label: option.labelKey,
  }))

  return (
    <Panel aria-labelledby="model-performance-heading" className="overflow-hidden">
      <Panel.Header
        actions={
          <div className="flex items-center gap-3">
            <SegmentedControl
              label={t('Performance window')}
              onChange={(next) => setHours(Number(next) as PerformanceWindowHours)}
              options={windowOptions}
              size="sm"
              value={String(hours)}
            />
            <PollStatus
              dataUpdatedAt={summaryQuery.dataUpdatedAt}
              isFetching={summaryQuery.isFetching}
              onRefresh={refresh}
              refreshLabel={t('Refresh model performance')}
            />
          </div>
        }
        icon={<HeartPulseIcon aria-hidden="true" className="size-5 text-primary" />}
        title={t('Model performance')}
        titleId="model-performance-heading"
      />

      {summaryQuery.isError ? (
        <div className="p-5">
          <Alert
            action={
              <Button
                aria-busy={summaryQuery.isFetching}
                disabled={summaryQuery.isFetching}
                onClick={() => void summaryQuery.refetch()}
                variant="outline"
              >
                {t('Try again')}
              </Button>
            }
            icon={<TriangleAlertIcon aria-hidden="true" />}
            title={t('Could not load model performance')}
            tone="destructive"
          >
            {toErrorMessage(summaryQuery.error)}
          </Alert>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-3">
            <StatCard
              icon={<HeartPulseIcon aria-hidden="true" />}
              iconTone={successRateTone(rollup.successRate)}
              label={t('Success rate')}
              value={formatSuccessRate(rollup.successRate)}
            />
            <StatCard
              icon={<TimerIcon aria-hidden="true" />}
              iconTone="warning"
              label={t('Average latency')}
              value={formatLatencyMs(rollup.avgLatencyMs)}
            />
            <StatCard
              icon={<GaugeIcon aria-hidden="true" />}
              iconTone="info"
              label={t('Throughput')}
              value={formatThroughput(rollup.avgTps)}
            />
          </div>

          <DataTable
            className="hidden md:block"
            emptyDescription={t('No request has been recorded in this window, so the gateway has nothing to grade. Widen the window or send traffic through the API.')}
            emptyIcon={<GaugeIcon aria-hidden="true" className="mx-auto size-7 text-muted" />}
            emptyTitle={t('No model metrics in this window')}
            isFetching={summaryQuery.isFetching}
            isLoading={summaryQuery.isLoading}
            label={t('Model performance summary')}
            loadingLabel={t('Loading model performance')}
            minWidthClassName="min-w-[52rem]"
            table={table}
          />

          <div className="p-4 md:hidden">
            <MobileCardList
              emptyDescription={t('No request has been recorded in this window, so the gateway has nothing to grade. Widen the window or send traffic through the API.')}
              emptyIcon={<GaugeIcon aria-hidden="true" className="mx-auto size-7 text-muted" />}
              emptyTitle={t('No model metrics in this window')}
              isFetching={summaryQuery.isFetching}
              isLoading={summaryQuery.isLoading}
              label={t('Model performance cards')}
              loadingLabel={t('Loading model performance')}
              table={table}
            />
          </div>
        </>
      )}

      <Panel.Footer align="start">
        <p className="text-xs leading-5 text-muted">
          {t('The three figures above are UNWEIGHTED means across the {{count}} models in this window: sum ÷ model count, with latency and throughput ignoring zeros. The endpoint sorts models by request volume but does not publish the volume itself, so a traffic-weighted average is not computable here.', {
            count: rollup.modelCount,
          })}
          {' '}
          {t('Grade thresholds are the console\'s, not the server\'s: healthy at SUCCESS_RATE_GOOD_MIN ({{good}}%), degraded at SUCCESS_RATE_WARNING_MIN ({{warning}}%), failing below that.', {
            good: SUCCESS_RATE_GOOD_MIN,
            warning: SUCCESS_RATE_WARNING_MIN,
          })}
          {' '}
          {t('These are platform-wide figures for the whole gateway, not one account\'s traffic.')}
        </p>
      </Panel.Footer>
    </Panel>
  )
}
