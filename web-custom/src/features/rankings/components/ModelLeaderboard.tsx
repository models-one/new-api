import TrophyIcon from 'lucide-react/dist/esm/icons/trophy'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTable, MobileCardList, useDataTable, type DataTableColumns } from '@/components/data'
import { Panel } from '@/components/ui'
import { MovementBadge } from '@/features/rankings/components/MovementBadge'
import { RANKED_MODEL_LIMIT, type RankedModel } from '@/features/rankings/api'
import { formatShare, modelMovement } from '@/features/rankings/rankings-presentation'
import { formatNumber, formatTokens } from '@/lib/format'

/** The server caps `models` at 20 rows, so the whole leaderboard fits one page. */
const ALL_ROWS = 50

type Cell = { row: { original: RankedModel } }

/**
 * The model leaderboard, straight from `rankings.models`.
 *
 * Columns show only what the payload carries. There is no request count, no spend and no
 * latency in `/api/rankings`, and the `category` field the wire does carry is hardcoded to
 * `"all"` server-side, so it is not surfaced as a dimension.
 */
export function ModelLeaderboard(props: {
  models: RankedModel[]
  isLoading: boolean
  isFetching: boolean
  baseline: string
  periodLabel: string
}) {
  const { t } = useTranslation()
  const { baseline } = props

  const columns = useMemo<DataTableColumns<RankedModel>>(
    () => [
      {
        id: 'rank',
        header: t('Rank'),
        cell: ({ row }: Cell) => formatNumber(row.original.rank),
        meta: { label: t('Rank'), align: 'right' as const, mono: true },
      },
      {
        id: 'model',
        header: t('Model'),
        cell: ({ row }: Cell) => <span className="mono">{row.original.model_name}</span>,
        meta: {
          label: t('Model'),
          mobilePrimary: true,
          toText: (_value: unknown, row: RankedModel) => row.model_name,
        },
      },
      {
        id: 'vendor',
        header: t('Provider'),
        cell: ({ row }: Cell) => row.original.vendor,
        meta: { label: t('Provider') },
      },
      {
        id: 'tokens',
        header: t('Tokens'),
        cell: ({ row }: Cell) => (
          // The compact form is the readable one; the exact count stays available on hover.
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
          <MovementBadge comparedTo={baseline} movement={modelMovement(row.original)} />
        ),
        meta: { label: t('Change'), align: 'right' as const },
      },
    ],
    [baseline, t],
  )

  const { table } = useDataTable<RankedModel>({
    columns,
    data: props.models,
    defaultPageSize: ALL_ROWS,
    getRowId: (row) => row.model_name,
    total: props.models.length,
  })

  const emptyTitle = t('No models ranked yet')
  const emptyDescription = t('This gateway relayed no traffic in this window, so there is nothing to rank.')

  return (
    <Panel>
      <Panel.Header
        description={t(
          'Ranked by tokens relayed through this gateway over {{period}}. Only the {{limit}} busiest models are listed.',
          { limit: RANKED_MODEL_LIMIT, period: props.periodLabel },
        )}
        headingLevel={2}
        icon={<TrophyIcon aria-hidden="true" className="size-4" />}
        title={t('Model leaderboard')}
      />
      <Panel.Body padded={false}>
        {/*
          Six columns need 720px, which a phone does not have: the table alone would hand a
          visitor a rank, half a model name and nothing else. Below `md` the same rows and
          the same column definitions are rendered as cards instead.
        */}
        <DataTable
          className="hidden md:block"
          columns={columns}
          emptyDescription={emptyDescription}
          emptyTitle={emptyTitle}
          isFetching={props.isFetching}
          isLoading={props.isLoading}
          label={t('Model leaderboard')}
          loadingLabel={t('Loading the model leaderboard')}
          minWidthClassName="min-w-[720px]"
          table={table}
        />

        <div className="p-4 md:hidden">
          <MobileCardList
            emptyDescription={emptyDescription}
            emptyTitle={emptyTitle}
            isFetching={props.isFetching}
            isLoading={props.isLoading}
            label={t('Model leaderboard cards')}
            loadingLabel={t('Loading the model leaderboard')}
            table={table}
          />
        </div>
      </Panel.Body>
    </Panel>
  )
}
