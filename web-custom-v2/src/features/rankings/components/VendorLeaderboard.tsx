import BuildingIcon from 'lucide-react/dist/esm/icons/building-2'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTable, MobileCardList, useDataTable, type DataTableColumns } from '@/components/data'
import { Panel } from '@/components/ui'
import type { RankedVendor } from '@/features/rankings/api'
import { formatShare } from '@/features/rankings/rankings-presentation'
import { formatNumber, formatTokens } from '@/lib/format'

const ALL_ROWS = 50

type Cell = { row: { original: RankedVendor } }

/**
 * The provider leaderboard, straight from `rankings.vendors`.
 *
 * There is deliberately no Change column here. `service/rankings.go` reports `growth_pct: 100`
 * both for a genuine doubling and for a provider that had NO traffic in the preceding window,
 * and only `previous_rank` tells the two apart — which vendor rows, unlike model rows, do not
 * carry. On a gateway with no prior period every provider would therefore be badged "+100%",
 * a measured doubling that never happened, right under a model leaderboard correctly badging
 * the same fact as "New". Until the payload carries a vendor baseline, the honest thing is to
 * say nothing rather than to say something wrong.
 */
export function VendorLeaderboard(props: {
  vendors: RankedVendor[]
  isLoading: boolean
  isFetching: boolean
  periodLabel: string
}) {
  const { t } = useTranslation()

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
    ],
    [t],
  )

  const { table } = useDataTable<RankedVendor>({
    columns,
    data: props.vendors,
    defaultPageSize: ALL_ROWS,
    getRowId: (row) => row.vendor,
    total: props.vendors.length,
  })

  const emptyTitle = t('No providers ranked yet')
  const emptyDescription = t('No provider had traffic in this window.')

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
        {/*
          The table needs more width than a phone has, so below `md` the same rows and the
          same column definitions are rendered as cards instead of being cut off mid-word.
        */}
        <DataTable
          className="hidden md:block"
          columns={columns}
          emptyDescription={emptyDescription}
          emptyTitle={emptyTitle}
          isFetching={props.isFetching}
          isLoading={props.isLoading}
          label={t('Provider leaderboard')}
          loadingLabel={t('Loading the provider leaderboard')}
          minWidthClassName="min-w-[640px]"
          table={table}
        />

        <div className="p-4 md:hidden">
          <MobileCardList
            emptyDescription={emptyDescription}
            emptyTitle={emptyTitle}
            isFetching={props.isFetching}
            isLoading={props.isLoading}
            label={t('Provider leaderboard cards')}
            loadingLabel={t('Loading the provider leaderboard')}
            table={table}
          />
        </div>
      </Panel.Body>
    </Panel>
  )
}
