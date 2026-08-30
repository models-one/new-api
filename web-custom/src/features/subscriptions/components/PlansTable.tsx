import PencilIcon from 'lucide-react/dist/esm/icons/pencil'
import PowerIcon from 'lucide-react/dist/esm/icons/power'
import PowerOffIcon from 'lucide-react/dist/esm/icons/power-off'
import RotateCcwIcon from 'lucide-react/dist/esm/icons/rotate-ccw'
import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { ActionsCell, BadgeCell, DataTable, MonoCell, TruncatedCell, useDataTable } from '@/components/data'
import type { DataTableColumns, DataTableRowAction } from '@/components/data'
import { StatusBadge } from '@/components/ui'
import type { AdminPlanRecord, SubscriptionPlan } from '@/features/subscriptions/api'
import { formatPlanDuration, formatResetPeriod, wiredPaymentChannels } from '@/features/subscriptions/plan-format'
import { formatCurrency, formatQuota } from '@/lib/format'

type PlansTableProps = {
  records: AdminPlanRecord[] | undefined
  isLoading: boolean
  isFetching: boolean
  /** `quota_per_unit` from `/api/status`. */
  quotaPerUnit: number
  /** Create, edit and enable/disable are refused server-side until compliance is confirmed. */
  mutationsLocked: boolean
  onEdit: (plan: SubscriptionPlan) => void
  onToggle: (plan: SubscriptionPlan) => void
  onReset: (plan: SubscriptionPlan) => void
  emptyAction?: ReactNode
}

/** The list endpoint returns every plan at once, so the table paginates nothing. */
const ALL_ROWS = 500

export function PlansTable(props: PlansTableProps) {
  const { t } = useTranslation()
  const { mutationsLocked, onEdit, onReset, onToggle, quotaPerUnit } = props

  const rows = useMemo(() => props.records?.map((record) => record.plan) ?? [], [props.records])

  const columns = useMemo<DataTableColumns<SubscriptionPlan>>(
    () => [
      {
        id: 'title',
        accessorKey: 'title',
        header: t('Plan'),
        meta: { label: t('Plan'), mobilePrimary: true },
        cell: ({ row }) => (
          <div className="min-w-0">
            <span className="block truncate font-semibold text-foreground">{row.original.title}</span>
            {row.original.subtitle === '' ? null : (
              <TruncatedCell className="text-xs text-muted" value={row.original.subtitle} />
            )}
          </div>
        ),
      },
      {
        id: 'price_amount',
        accessorKey: 'price_amount',
        header: t('Price'),
        meta: { align: 'right', label: t('Price'), mono: true },
        cell: ({ row }) => (
          <MonoCell align="right" value={formatCurrency(row.original.price_amount)} />
        ),
      },
      {
        id: 'duration',
        header: t('Validity'),
        enableSorting: false,
        meta: { label: t('Validity') },
        cell: ({ row }) => <span className="text-muted">{formatPlanDuration(row.original, t)}</span>,
      },
      {
        id: 'quota_reset_period',
        accessorKey: 'quota_reset_period',
        header: t('Quota reset'),
        meta: { label: t('Quota reset') },
        cell: ({ row }) => <span className="text-muted">{formatResetPeriod(row.original, t)}</span>,
      },
      {
        id: 'total_amount',
        accessorKey: 'total_amount',
        header: t('Plan quota'),
        meta: { align: 'right', label: t('Plan quota'), mono: true },
        cell: ({ row }) => {
          if (row.original.total_amount === 0) {
            return <span className="text-muted">{t('Unlimited')}</span>
          }
          return (
            <MonoCell
              align="right"
              title={t('{{units}} quota units', { units: row.original.total_amount })}
              value={formatQuota(row.original.total_amount, quotaPerUnit)}
            />
          )
        },
      },
      {
        id: 'sort_order',
        accessorKey: 'sort_order',
        header: t('Priority'),
        meta: { align: 'right', label: t('Priority'), mono: true },
        cell: ({ row }) => <MonoCell align="right" value={row.original.sort_order} />,
      },
      {
        id: 'enabled',
        accessorKey: 'enabled',
        header: t('Status'),
        meta: { label: t('Status') },
        cell: ({ row }) => (
          <StatusBadge tone={row.original.enabled ? 'success' : 'muted'}>
            {row.original.enabled ? t('Enabled') : t('Disabled')}
          </StatusBadge>
        ),
      },
      {
        id: 'payment',
        header: t('Payment channels'),
        enableSorting: false,
        meta: { label: t('Payment channels') },
        cell: ({ row }) => {
          const channels = wiredPaymentChannels(row.original)
          if (channels.length === 0) {
            return <span className="text-muted">{t('Balance only')}</span>
          }
          return (
            <span className="flex flex-wrap gap-1">
              {channels.map((channel) => (
                <BadgeCell key={channel.id} label={channel.label} size="sm" tone="info" />
              ))}
            </span>
          )
        },
      },
      {
        id: 'upgrade_group',
        accessorKey: 'upgrade_group',
        header: t('Upgrade group'),
        meta: { label: t('Upgrade group') },
        cell: ({ row }) => {
          if (row.original.upgrade_group === '') {
            return <span className="text-muted">{t('No group change')}</span>
          }
          return <BadgeCell label={row.original.upgrade_group} mono size="sm" />
        },
      },
      {
        id: 'actions',
        header: t('Actions'),
        enableSorting: false,
        meta: { align: 'right', label: t('Actions') },
        cell: ({ row }) => {
          const plan = row.original
          const actions: DataTableRowAction[] = [
            {
              id: 'edit',
              label: t('Edit plan'),
              icon: <PencilIcon />,
              onClick: () => onEdit(plan),
              disabled: mutationsLocked,
            },
            {
              id: 'reset',
              label: t('Reset quota'),
              icon: <RotateCcwIcon />,
              onClick: () => onReset(plan),
            },
            {
              id: 'toggle',
              label: plan.enabled ? t('Disable plan') : t('Enable plan'),
              icon: plan.enabled ? <PowerOffIcon /> : <PowerIcon />,
              onClick: () => onToggle(plan),
              disabled: mutationsLocked,
              tone: plan.enabled ? 'danger' : 'default',
            },
          ]
          return <ActionsCell actions={actions} label={t('Plan actions')} />
        },
      },
    ],
    [mutationsLocked, onEdit, onReset, onToggle, quotaPerUnit, t],
  )

  const { table } = useDataTable<SubscriptionPlan>({
    columns,
    data: rows,
    defaultPageSize: ALL_ROWS,
    getRowId: (row) => String(row.id),
    // The endpoint neither paginates nor sorts on request; ordering happens in the browser.
    manualSorting: false,
    total: rows.length,
  })

  return (
    <DataTable
      columns={columns}
      emptyAction={props.emptyAction}
      emptyDescription={t('A plan describes what a subscriber pays, how long the subscription lasts and how much quota it grants. Create one to open the storefront.')}
      emptyTitle={t('No subscription plans yet')}
      isFetching={props.isFetching}
      isLoading={props.isLoading}
      label={t('Subscription plans')}
      loadingLabel={t('Loading subscription plans')}
      minWidthClassName="min-w-[1180px]"
      skeletonRows={4}
      table={table}
    />
  )
}
