import GaugeIcon from 'lucide-react/dist/esm/icons/gauge'
import ServerIcon from 'lucide-react/dist/esm/icons/server'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import type { TFunction } from 'i18next'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  BadgeCell,
  DataTable,
  DataTablePagination,
  MonoCell,
  useDataTable,
  type DataTableColumns,
} from '@/components/data'
import { Alert, Button, Panel } from '@/components/ui'
import { healthFromSuccessRate, type ModelPerfSummary } from '@/lib/api/metrics'
import { formatLatencyMs, formatPercent } from '@/lib/format'

/**
 * Mirrors the thresholds inside `healthFromSuccessRate` (src/lib/api/metrics.ts).
 * The backend has no health enum, only a raw success rate, so this verdict is a
 * console-side classification — the panel footnote states the numbers in full.
 */
const HEALTHY_SUCCESS_RATE_PERCENT = 99
const DEGRADED_SUCCESS_RATE_PERCENT = 90

const PLATFORM_PAGE_SIZE = 10

type PlatformHealthPanelProps = {
  models: readonly ModelPerfSummary[]
  /** Reads as "the last 7 days". */
  rangeCaption: string
  isPending: boolean
  isFetching: boolean
  isError: boolean
  errorMessage: string
  onRetry: () => void
}

function healthLabel(key: string, t: TFunction): string {
  if (key === 'Healthy') return t('Healthy')
  if (key === 'Degraded') return t('Degraded')
  return t('Unhealthy')
}

export function PlatformHealthPanel(props: PlatformHealthPanelProps) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)

  const pageCount = Math.max(1, Math.ceil(props.models.length / PLATFORM_PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageRows = useMemo(
    () => props.models.slice((currentPage - 1) * PLATFORM_PAGE_SIZE, currentPage * PLATFORM_PAGE_SIZE),
    [currentPage, props.models],
  )

  const columns = useMemo<DataTableColumns<ModelPerfSummary>>(
    () => [
      {
        accessorKey: 'model_name',
        header: t('Model'),
        enableSorting: false,
        meta: { label: t('Model'), mono: true, mobilePrimary: true },
        cell: ({ row }) => <MonoCell value={row.original.model_name} />,
      },
      {
        accessorKey: 'avg_latency_ms',
        header: t('Average latency'),
        enableSorting: false,
        meta: { align: 'right', label: t('Average latency'), mono: true },
        cell: ({ row }) => (
          <MonoCell align="right" value={formatLatencyMs(row.original.avg_latency_ms)} />
        ),
      },
      {
        accessorKey: 'success_rate',
        header: t('Success rate'),
        enableSorting: false,
        meta: { align: 'right', label: t('Success rate'), mono: true },
        cell: ({ row }) => (
          <MonoCell align="right" value={formatPercent(row.original.success_rate, 2)} />
        ),
      },
      {
        accessorKey: 'avg_tps',
        header: t('Tokens per second'),
        enableSorting: false,
        meta: { align: 'right', label: t('Tokens per second'), mono: true },
        cell: ({ row }) => <MonoCell align="right" value={row.original.avg_tps.toFixed(2)} />,
      },
      {
        id: 'health',
        header: t('Health'),
        enableSorting: false,
        meta: { align: 'right', label: t('Health') },
        cell: ({ row }) => {
          const health = healthFromSuccessRate(row.original.success_rate)
          return <BadgeCell label={healthLabel(health.key, t)} tone={health.tone} />
        },
      },
    ],
    [t],
  )

  const { table, paginationControls } = useDataTable<ModelPerfSummary>({
    columns,
    data: pageRows,
    getRowId: (row) => row.model_name,
    onPageChange: (query) => setPage(query.p),
    page: currentPage,
    pageSize: PLATFORM_PAGE_SIZE,
    total: props.models.length,
  })

  return (
    <Panel aria-labelledby="platform-health-title">
      <Panel.Header
        description={t(
          'Measured across every request this gateway served in the last {{range}}, by all users. These figures are not your own traffic.',
          { range: props.rangeCaption },
        )}
        icon={<ServerIcon aria-hidden="true" className="text-secondary" />}
        title={t('Platform service health')}
        titleId="platform-health-title"
      />

      {props.isError ? (
        <Panel.Body>
          <Alert
            action={
              <Button
                aria-busy={props.isFetching}
                disabled={props.isFetching}
                onClick={props.onRetry}
                size="sm"
                variant="outline"
              >
                {t('Try again')}
              </Button>
            }
            icon={<TriangleAlertIcon />}
            title={t('Service metrics could not be loaded')}
            tone="destructive"
          >
            {props.errorMessage}
          </Alert>
        </Panel.Body>
      ) : (
        <Panel.Body padded={false}>
          <DataTable
            columns={columns}
            emptyDescription={t(
              'This gateway recorded no model performance samples in the selected range.',
            )}
            emptyIcon={<GaugeIcon aria-hidden="true" className="mx-auto size-7 text-muted" />}
            emptyTitle={t('No service metrics available')}
            isFetching={props.isFetching}
            isLoading={props.isPending}
            label={t('Platform service health by model')}
            loadingLabel={t('Loading service metrics')}
            minWidthClassName="min-w-[720px]"
            skeletonRows={5}
            table={table}
          />

          {props.models.length > PLATFORM_PAGE_SIZE ? (
            <div className="border-t border-border px-5 py-3">
              <DataTablePagination
                {...paginationControls}
                isFetching={props.isFetching}
                label={t('Service health pages')}
                showPageSize={false}
              />
            </div>
          ) : null}
        </Panel.Body>
      )}

      <Panel.Footer align="start">
        <p className="text-xs leading-5 text-muted">
          {t(
            'Health is a label this console derives from the success rate: {{healthy}}% or above is Healthy, {{degraded}}% or above is Degraded, below that is Unhealthy.',
            { degraded: DEGRADED_SUCCESS_RATE_PERCENT, healthy: HEALTHY_SUCCESS_RATE_PERCENT },
          )}
        </p>
      </Panel.Footer>
    </Panel>
  )
}
