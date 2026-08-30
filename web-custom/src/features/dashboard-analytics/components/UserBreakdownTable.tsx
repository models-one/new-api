import UsersIcon from 'lucide-react/dist/esm/icons/users'
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
import type { UserTotals } from '@/features/dashboard-analytics/users'
import { formatCompactNumber, formatPercent, formatQuota, formatTokens } from '@/lib/format'

/** `/api/data/users` neither paginates nor sorts, so the whole list is handed over at once. */
const ALL_ROWS = 500

type UserBreakdownTableProps = {
  users: readonly UserTotals[]
  quotaPerUnit: number
  isPending: boolean
  isFetching: boolean
}

export function UserBreakdownTable(props: UserBreakdownTableProps) {
  const { t } = useTranslation()
  const quotaPerUnit = props.quotaPerUnit
  const anonymous = t('Unattributed')

  const columns = useMemo<DataTableColumns<UserTotals>>(
    () => [
      {
        id: 'username',
        accessorFn: (row: UserTotals) => (row.username === '' ? anonymous : row.username),
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('User')} />,
        cell: ({ row }) => (
          <MonoCell
            className={row.original.username === '' ? 'text-muted' : undefined}
            value={row.original.username === '' ? anonymous : row.original.username}
          />
        ),
        meta: { label: t('User'), mobilePrimary: true, mono: true },
      },
      {
        id: 'quota',
        accessorFn: (row: UserTotals) => row.quota,
        header: ({ column }) => <DataTableColumnHeader align="right" column={column} title={t('Spend')} />,
        cell: ({ row }) => <MonoCell align="right" value={formatQuota(row.original.quota, quotaPerUnit)} />,
        meta: { align: 'right', label: t('Spend'), mono: true },
      },
      {
        id: 'tokens',
        accessorFn: (row: UserTotals) => row.tokens,
        header: ({ column }) => <DataTableColumnHeader align="right" column={column} title={t('Tokens')} />,
        cell: ({ row }) => <MonoCell align="right" value={formatTokens(row.original.tokens)} />,
        meta: { align: 'right', label: t('Tokens'), mono: true },
      },
      {
        id: 'requests',
        accessorFn: (row: UserTotals) => row.requests,
        header: ({ column }) => <DataTableColumnHeader align="right" column={column} title={t('Requests')} />,
        cell: ({ row }) => <MonoCell align="right" value={formatCompactNumber(row.original.requests)} />,
        meta: { align: 'right', label: t('Requests'), mono: true },
      },
      {
        id: 'share',
        accessorFn: (row: UserTotals) => row.share,
        header: ({ column }) => <DataTableColumnHeader align="right" column={column} title={t('Share')} />,
        cell: ({ row }) => <MonoCell align="right" value={formatPercent(row.original.share)} />,
        meta: { align: 'right', label: t('Share'), mono: true },
      },
    ],
    [anonymous, quotaPerUnit, t],
  )

  const { table } = useDataTable<UserTotals>({
    columns,
    data: [...props.users],
    defaultPageSize: ALL_ROWS,
    defaultSorting: [{ id: 'quota', desc: true }],
    getRowId: (row) => (row.username === '' ? '__unattributed__' : row.username),
    manualSorting: false,
    total: props.users.length,
  })

  const emptyDescription = t('No user recorded any traffic in this range, so the server returned no rows.')

  return (
    <Panel className="overflow-hidden">
      <Panel.Header
        description={t('Every user the endpoint returned, not only the ranked ones.')}
        title={t('Consumption by user')}
      />

      <div className="hidden md:block">
        <DataTable
          columns={columns}
          emptyDescription={emptyDescription}
          emptyIcon={<UsersIcon aria-hidden="true" />}
          emptyTitle={t('No user activity')}
          isFetching={props.isFetching}
          isLoading={props.isPending}
          label={t('Consumption by user')}
          loadingLabel={t('Loading user consumption')}
          minWidthClassName="min-w-[720px]"
          skeletonRows={5}
          table={table}
        />
      </div>

      <div className="md:hidden">
        <MobileCardList
          emptyDescription={emptyDescription}
          emptyIcon={<UsersIcon aria-hidden="true" />}
          emptyTitle={t('No user activity')}
          isFetching={props.isFetching}
          isLoading={props.isPending}
          label={t('User consumption cards')}
          loadingLabel={t('Loading user consumption')}
          skeletonRows={4}
          table={table}
        />
      </div>

      <Panel.Footer align="start">
        <DerivationNote>
          {t(
            'Share is computed here as user spend ÷ RANGE_QUOTA, where RANGE_QUOTA is the sum of quota across every row the endpoint returned, × 100.',
          )}
        </DerivationNote>
      </Panel.Footer>
    </Panel>
  )
}
