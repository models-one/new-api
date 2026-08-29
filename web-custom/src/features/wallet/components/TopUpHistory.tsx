import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  BadgeCell,
  DataTable,
  DataTablePagination,
  MonoCell,
  useDataTable,
  type DataTableColumns,
  type PageQuery,
} from '@/components/data'
import { toErrorMessage } from '@/components/overlay'
import { Alert, Button, type Tone } from '@/components/ui'
import { topUpHistoryQuery, type TopUpRecord } from '@/lib/api/topup'
import { formatCurrency, formatDateTime, formatNumber } from '@/lib/format'

/** `GET /api/user/topup/self` filters on this window server-side (model/topup.go). */
export const HISTORY_WINDOW_DAYS = 30

const HISTORY_PAGE_SIZE = 10

/**
 * `/api/user/topup/self` also returns `payment_method` and `payment_provider` — both
 * confirmed on the live wire — but the shared `TopUpRecord` type does not declare them.
 * Optional here so a row that omits them still renders.
 */
type WalletTopUpRecord = TopUpRecord & {
  payment_method?: string
  payment_provider?: string
}

/** Status vocabulary from `common/constants.go` (TopUpStatus*). */
const statusTones: Record<string, Tone> = {
  pending: 'warning',
  success: 'success',
  failed: 'destructive',
  expired: 'muted',
}

export function TopUpHistory() {
  const { t } = useTranslation()
  const [pageQuery, setPageQuery] = useState<PageQuery>({ p: 1, page_size: HISTORY_PAGE_SIZE })
  const historyQuery = useQuery(topUpHistoryQuery(pageQuery.p, pageQuery.page_size))

  const columns = useMemo<DataTableColumns<WalletTopUpRecord>>(
    () => [
      {
        accessorKey: 'create_time',
        header: t('Created'),
        enableSorting: false,
        meta: { label: t('Created'), mono: true, mobilePrimary: true },
        cell: ({ row }) => <MonoCell value={formatDateTime(row.original.create_time)} />,
      },
      {
        accessorKey: 'trade_no',
        header: t('Order number'),
        enableSorting: false,
        meta: { label: t('Order number'), mono: true },
        cell: ({ row }) => <MonoCell title={row.original.trade_no} value={row.original.trade_no} />,
      },
      {
        accessorKey: 'payment_method',
        header: t('Method'),
        enableSorting: false,
        meta: { label: t('Method') },
        cell: ({ row }) => {
          const method = row.original.payment_method
          if (!method) return <MonoCell value={null} />
          return <BadgeCell label={method} mono tone="muted" />
        },
      },
      {
        accessorKey: 'amount',
        header: t('Credited'),
        enableSorting: false,
        meta: { label: t('Credited'), align: 'right', mono: true },
        cell: ({ row }) => <MonoCell align="right" value={formatNumber(row.original.amount)} />,
      },
      {
        accessorKey: 'money',
        header: t('Charged'),
        enableSorting: false,
        meta: { label: t('Charged'), align: 'right', mono: true },
        // `money` is what the provider charged in ITS currency (an Epay order for 100
        // units is billed 730.00 at the server's own 7.3 rate). No currency code comes
        // back with it, so the symbol is deliberately empty rather than a guessed "$".
        cell: ({ row }) => <MonoCell align="right" value={formatCurrency(row.original.money, { symbol: '' })} />,
      },
      {
        accessorKey: 'status',
        header: t('Status'),
        enableSorting: false,
        meta: { label: t('Status') },
        cell: ({ row }) => (
          <BadgeCell label={row.original.status} mono tone={statusTones[row.original.status] ?? 'muted'} />
        ),
      },
      {
        accessorKey: 'complete_time',
        header: t('Completed'),
        enableSorting: false,
        meta: { label: t('Completed'), mono: true },
        cell: ({ row }) => {
          const completed = row.original.complete_time
          if (!completed) return <MonoCell value={null} />
          return <MonoCell value={formatDateTime(completed)} />
        },
      },
    ],
    [t],
  )

  const { table, paginationControls } = useDataTable<WalletTopUpRecord>({
    columns,
    data: historyQuery.data?.items,
    total: historyQuery.data?.total,
    page: pageQuery.p,
    pageSize: pageQuery.page_size,
    onPageChange: setPageQuery,
    getRowId: (row) => String(row.id),
  })

  if (historyQuery.isError) {
    return (
      <div className="p-6">
        <Alert
          action={
            <Button
              aria-busy={historyQuery.isFetching}
              disabled={historyQuery.isFetching}
              onClick={() => void historyQuery.refetch()}
              size="sm"
              variant="outline"
            >
              {t('Try again')}
            </Button>
          }
          title={t('Order history could not be loaded')}
          tone="destructive"
        >
          {toErrorMessage(historyQuery.error)}
        </Alert>
      </div>
    )
  }

  return (
    <>
      <DataTable
        columns={columns}
        emptyDescription={t('Top-up orders from the last {{days}} days appear here.', {
          days: HISTORY_WINDOW_DAYS,
        })}
        emptyTitle={t('No top-up orders yet')}
        isFetching={historyQuery.isFetching}
        isLoading={historyQuery.isPending}
        label={t('Top-up orders')}
        loadingLabel={t('Loading top-up orders')}
        minWidthClassName="min-w-[880px]"
        table={table}
      />
      <DataTablePagination
        {...paginationControls}
        isFetching={historyQuery.isFetching}
        label={t('Top-up order pages')}
      />
    </>
  )
}
