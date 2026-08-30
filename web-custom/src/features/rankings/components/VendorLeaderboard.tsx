import BuildingIcon from 'lucide-react/dist/esm/icons/building-2'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTable, useDataTable, type DataTableColumns } from '@/components/data'
import { Panel } from '@/components/ui'
import { MovementBadge } from '@/features/rankings/components/MovementBadge'
import type { RankedVendor } from '@/features/rankings/api'
import { formatShare, vendorMovement } from '@/features/rankings/rankings-presentation'
import { formatNumber, formatTokens } from '@/lib/format'

const ALL_ROWS = 50

type Cell = { row: { original: RankedVendor } }

/**
 * The provider leaderboard, straight from `rankings.vendors`.
 *
 * Vendor rows carry no `previous_rank`, so a provider's change is always read as a measured
 * percentage — the payload gives no way to tell a new provider from a growing one.
 */
export function VendorLeaderboard(props: {
  vendors: RankedVendor[]
  isLoading: boolean
  isFetching: boolean
  baseline: string
  periodLabel: string
}) {
  const { t } = useTranslation()
  const { baseline } = props

  const columns = useMemo<DataTableColumns<RankedVendor>>(
    () => [
      {
        id: 'rank',
        header: t('Rank'),
        cell: ({ row }: Cell) => formatNumber(row.original.rank),
        meta: { label: t('Rank'), align: 'right' as const, mono: true },
      },
      {
        id: 'vendor',
        header: t('Provider'),
        cell: ({ row }: Cell) => row.original.vendor,
        meta: {
          label: t('Provider'),
          mobilePrimary: true,
          toText: (_value: unknown, row: RankedVendor) => row.vendor,
        },
      },
      {
        id: 'models',
        header: t('Models'),
        cell: ({ row }: Cell) => formatNumber(row.original.models_count),
        meta: { label: t('Models'), align: 'right' as const, mono: true },
      },
      {
        id: 'top-model',
        header: t('Busiest model'),
        cell: ({ row }: Cell) => <span className="mono">{row.original.top_model}</span>,
        meta: { label: t('Busiest model') },
      },
      {
        id: 'tokens',
        header: t('Tokens'),
        cell: ({ row }: Cell) => (
          <span title={t('Exactly {{tokens}} tokens', { tokens: formatNumber(row.original.total_tokens) })}>
            {formatTokens(row.original.total_tokens)}
          </span>
        ),
        meta: { label: t('Tokens'), align: 'right' as const, mono: true },
      },
      {
        id: 'share',
        header: t('Share'),
        cell: ({ row }: Cell) => formatShare(row.original.share),
        meta: { label: t('Share'), align: 'right' as const, mono: true },
      },
      {
        id: 'movement',
        header: t('Change'),
        cell: ({ row }: Cell) => (
          <MovementBadge comparedTo={baseline} movement={vendorMovement(row.original.growth_pct)} />
        ),
        meta: { label: t('Change'), align: 'right' as const },
      },
    ],
    [baseline, t],
  )

  const { table } = useDataTable<RankedVendor>({
    columns,
    data: props.vendors,
    defaultPageSize: ALL_ROWS,
    getRowId: (row) => row.vendor,
    total: props.vendors.length,
  })

  return (
    <Panel>
      <Panel.Header
        description={t(
          'Every model a provider serves, added together over {{period}}. Models this gateway cannot attribute are grouped as “Unknown”.',
          { period: props.periodLabel },
        )}
        headingLevel={2}
        icon={<BuildingIcon aria-hidden="true" className="size-4" />}
        title={t('Provider leaderboard')}
      />
      <Panel.Body padded={false}>
        <DataTable
          columns={columns}
          emptyDescription={t('No provider had traffic in this window.')}
          emptyTitle={t('No providers ranked yet')}
          isFetching={props.isFetching}
          isLoading={props.isLoading}
          label={t('Provider leaderboard')}
          loadingLabel={t('Loading the provider leaderboard')}
          minWidthClassName="min-w-[760px]"
          table={table}
        />
      </Panel.Body>
    </Panel>
  )
}
