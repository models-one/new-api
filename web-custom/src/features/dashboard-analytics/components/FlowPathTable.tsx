import RouteIcon from 'lucide-react/dist/esm/icons/route'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import {
  DataTable,
  DataTableColumnHeader,
  MobileCardList,
  MonoCell,
  useDataTable,
  type DataTableColumns,
} from '@/components/data'
import { Panel } from '@/components/ui'
import { DerivationNote } from '@/features/dashboard-analytics/components/AnalyticsControls'
import type { FlowPath, FlowStageKind } from '@/features/dashboard-analytics/flow'
import { flowNodeLabel, flowStageLabel, isUnattributed } from '@/features/dashboard-analytics/presentation'
import { formatCompactNumber, formatPercent, formatQuota, formatTokens } from '@/lib/format'

/**
 * Every path is rendered at once. The endpoint neither paginates nor sorts, and
 * the row count is the product of the grouped dimensions — small enough to hand
 * to the browser, and splitting it would break the sort into per-page order.
 */
const ALL_ROWS = 500

type FlowPathTableProps = {
  paths: readonly FlowPath[]
  stages: readonly FlowStageKind[]
  quotaPerUnit: number
  isPending: boolean
  isFetching: boolean
  /** Shown in the empty state when a stage filter is what removed every row. */
  hasFilters: boolean
}

export function FlowPathTable(props: FlowPathTableProps) {
  const { t } = useTranslation()
  const quotaPerUnit = props.quotaPerUnit
  const stages = props.stages

  const columns = useMemo<DataTableColumns<FlowPath>>(() => {
    const stageColumns: DataTableColumns<FlowPath> = stages.map((kind, index) => ({
      id: `stage-${kind}`,
      accessorFn: (row: FlowPath) => flowNodeLabel(row.nodes[index] ?? { kind, id: '', name: '', refId: 0 }, t),
      enableSorting: true,
      header: ({ column }) => <DataTableColumnHeader column={column} title={flowStageLabel(kind, t)} />,
      cell: ({ row }) => {
        const node = row.original.nodes[index]
        if (!node) return <MonoCell value={null} />
        return (
          <MonoCell
            className={isUnattributed(node) ? 'text-muted' : undefined}
            value={flowNodeLabel(node, t)}
          />
        )
      },
      meta: { label: flowStageLabel(kind, t), mono: true },
    }))

    return [
      ...stageColumns,
      {
        id: 'quota',
        accessorFn: (row: FlowPath) => row.quota,
        header: ({ column }) => <DataTableColumnHeader align="right" column={column} title={t('Spend')} />,
        cell: ({ row }) => <MonoCell align="right" value={formatQuota(row.original.quota, quotaPerUnit)} />,
        meta: { align: 'right', label: t('Spend'), mono: true },
      },
      {
        id: 'tokens',
        accessorFn: (row: FlowPath) => row.tokens,
        header: ({ column }) => <DataTableColumnHeader align="right" column={column} title={t('Tokens')} />,
        cell: ({ row }) => <MonoCell align="right" value={formatTokens(row.original.tokens)} />,
        meta: { align: 'right', label: t('Tokens'), mono: true },
      },
      {
        id: 'requests',
        accessorFn: (row: FlowPath) => row.requests,
        header: ({ column }) => <DataTableColumnHeader align="right" column={column} title={t('Requests')} />,
        cell: ({ row }) => <MonoCell align="right" value={formatCompactNumber(row.original.requests)} />,
        meta: { align: 'right', label: t('Requests'), mono: true },
      },
      {
        id: 'share',
        accessorFn: (row: FlowPath) => row.share,
        header: ({ column }) => <DataTableColumnHeader align="right" column={column} title={t('Share')} />,
        cell: ({ row }) => <MonoCell align="right" value={formatPercent(row.original.share)} />,
        meta: { align: 'right', label: t('Share'), mono: true },
      },
    ]
  }, [quotaPerUnit, stages, t])

  const { table } = useDataTable<FlowPath>({
    columns,
    data: [...props.paths],
    defaultPageSize: ALL_ROWS,
    defaultSorting: [{ id: 'quota', desc: true }],
    getRowId: (row) => row.key,
    // Neither endpoint paginates or sorts on request; ordering happens here.
    manualSorting: false,
    total: props.paths.length,
  })

  const emptyDescription = props.hasFilters
    ? t('No path matches the dimensions you selected. Clear a filter to widen the view.')
    : t('The server recorded no grouped traffic for this range.')

  return (
    <Panel className="overflow-hidden">
      <Panel.Header
        description={t(
          'One row per distinct path across the dimensions above. This is the server response itself, re-grouped only where a dimension is hidden.',
        )}
        title={t('Traffic paths')}
      />

      <div className="hidden md:block">
        <DataTable
          columns={columns}
          emptyDescription={emptyDescription}
          emptyIcon={<RouteIcon aria-hidden="true" />}
          emptyTitle={t('No paths to show')}
          isFetching={props.isFetching}
          isLoading={props.isPending}
          label={t('Traffic paths')}
          loadingLabel={t('Loading traffic paths')}
          minWidthClassName="min-w-[820px]"
          skeletonRows={6}
          table={table}
        />
      </div>

      <div className="md:hidden">
        <MobileCardList
          emptyDescription={emptyDescription}
          emptyIcon={<RouteIcon aria-hidden="true" />}
          emptyTitle={t('No paths to show')}
          isFetching={props.isFetching}
          isLoading={props.isPending}
          label={t('Traffic path cards')}
          loadingLabel={t('Loading traffic paths')}
          skeletonRows={4}
          table={table}
        />
      </div>

      <Panel.Footer align="start">
        <DerivationNote>
          {t(
            'Share is computed here as path spend ÷ ATTRIBUTED_QUOTA, where ATTRIBUTED_QUOTA is the sum of the quota on the rows shown, × 100. The endpoint reports no percentages.',
          )}
        </DerivationNote>
      </Panel.Footer>
    </Panel>
  )
}
