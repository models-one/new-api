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
import { Panel, type Tone } from '@/components/ui'
import { UsageErrorAlert } from '@/features/usage/components/UsageErrorAlert'
import { topUpHistoryQuery, type TopUpRecord } from '@/lib/api/topup'
import { formatCurrency, formatDateTime, formatNumber } from '@/lib/format'

/**
 * `GET /api/user/topup/self` filters `create_time >= now - 30 days` server-side
 * (model/topup.go `topUpQueryCutoff`), whatever billing month the page is showing.
 * The panel says so, so an empty table never reads as lost history.
 */
export const ORDER_WINDOW_DAYS = 30

const ORDER_PAGE_SIZE = 10

/** Status vocabulary from the top-up records the server returns. */
const statusTones: Record<string, Tone> = {
  expired: 'muted',
  failed: 'destructive',
  pending: 'warning',
  success: 'success',
}

export function OrderHistoryPanel() {
  const { t, i18n } = useTranslation()
  const [pageQuery, setPageQuery] = useState<PageQuery>({ p: 1, page_size: ORDER_PAGE_SIZE })
  const historyQuery = useQuery(topUpHistoryQuery(pageQuery.p, pageQuery.page_size))

  const columns = useMemo<DataTableColumns<TopUpRecord>>(
    () => [
      {
        accessorKey: 'create_time',
        header: t('Date'),
        enableSorting: false,
        meta: { label: t('Date'), mono: true, mobilePrimary: true },
        cell: ({ row }) => <MonoCell value={formatDateTime(row.original.create_time, i18n.language)} />,
      },
      {
        accessorKey: 'trade_no',
        header: t('Order number'),
        enableSorting: false,
        meta: { label: t('Order number'), mono: true },
        cell: ({ row }) => <MonoCell title={row.original.trade_no} value={row.original.trade_no} />,
      },
      {
        accessorKey: 'amount',
        header: t('Credited'),
        enableSorting: false,
        meta: { align: 'right', label: t('Credited'), mono: true },
        // `amount` is the number of billing units credited, not a quota integer:
        // the server multiplies it by quota_per_unit when the order completes.
        cell: ({ row }) => <MonoCell align="right" value={formatNumber(row.original.amount)} />,
      },
      {
        accessorKey: 'money',
        header: t('Charged'),
        enableSorting: false,
        meta: { align: 'right', label: t('Charged'), mono: true },
        // `money` is what the payment provider charged, in ITS currency, and no
        // currency code comes back with it — hence no symbol rather than a guessed one.
        cell: ({ row }) => (
          <MonoCell align="right" value={formatCurrency(row.original.money, { symbol: '' })} />
        ),
      },
      {
        accessorKey: 'status',
        header: t('Status'),
        enableSorting: false,
        meta: { label: t('Status') },
        cell: ({ row }) => (
          <BadgeCell
            label={row.original.status}
            mono
            tone={statusTones[row.original.status] ?? 'muted'}
          />
        ),
      },
    ],
    [i18n.language, t],
  )

  const { table, paginationControls } = useDataTable<TopUpRecord>({
    columns,
    data: historyQuery.data?.items,
    getRowId: (row) => String(row.id),
    onPageChange: setPageQuery,
    page: pageQuery.p,
    pageSize: pageQuery.page_size,
    total: historyQuery.data?.total,
  })

  return (
    <Panel className="overflow-hidden">
      <Panel.Header
        description={t(
          'The server only returns orders from the last {{days}} days, whichever billing month is selected above.',
          { days: ORDER_WINDOW_DAYS },
        )}
        title={t('Top-up orders')}
      />

      {historyQuery.isError ? (
        <Panel.Body>
          <UsageErrorAlert
            error={historyQuery.error}
            isRetrying={historyQuery.isFetching}
            onRetry={() => void historyQuery.refetch()}
            title={t('Order history could not be loaded')}
          />
        </Panel.Body>
      ) : (
        <>
          <DataTable
            columns={columns}
            emptyDescription={t('Top-up orders from the last {{days}} days appear here.', {
              days: ORDER_WINDOW_DAYS,
            })}
            emptyTitle={t('No top-up orders yet')}
            isFetching={historyQuery.isFetching}
            isLoading={historyQuery.isPending}
            label={t('Top-up orders')}
            loadingLabel={t('Loading top-up orders')}
            minWidthClassName="min-w-[680px]"
            table={table}
          />
          <DataTablePagination
            {...paginationControls}
            isFetching={historyQuery.isFetching}
            label={t('Top-up order pages')}
          />
        </>
      )}
    </Panel>
  )
}
