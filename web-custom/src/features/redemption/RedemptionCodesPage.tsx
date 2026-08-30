import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import LockIcon from 'lucide-react/dist/esm/icons/lock'
import PencilIcon from 'lucide-react/dist/esm/icons/pencil'
import PlusIcon from 'lucide-react/dist/esm/icons/plus'
import PowerIcon from 'lucide-react/dist/esm/icons/power'
import PowerOffIcon from 'lucide-react/dist/esm/icons/power-off'
import ShieldAlertIcon from 'lucide-react/dist/esm/icons/shield-alert'
import TicketIcon from 'lucide-react/dist/esm/icons/ticket'
import Trash2Icon from 'lucide-react/dist/esm/icons/trash-2'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  ActionsCell,
  BadgeCell,
  DataTable,
  DataTableColumnHeader,
  DataTablePagination,
  DataTableToolbar,
  MobileCardList,
  MonoCell,
  useDataTable,
  type DataTableColumns,
  type DataTableRowAction,
} from '@/components/data'
import { NativeSelect, SearchInput, type NativeSelectOption } from '@/components/form'
import { ConfirmDialog, toErrorMessage, toast } from '@/components/overlay'
import { Alert, Button, MaskedValue, PageHeader, Panel, StatusBadge } from '@/components/ui'
import { useAdminAccess } from '@/features/redemption/admin-access'
import {
  deleteInvalidRedemptions,
  deleteRedemption,
  redemptionsQuery,
  REDEMPTION_EXPIRED_FILTER,
  REDEMPTION_STATUS,
  updateRedemptionStatus,
  type RedemptionCode,
  type RedemptionStatusFilter,
} from '@/features/redemption/api'
import {
  canEditRedemption,
  canToggleRedemption,
  REDEMPTION_STATE_LABEL,
  REDEMPTION_STATE_TONE,
  redemptionState,
} from '@/features/redemption/redemption-presentation'
import { RedemptionDrawer } from '@/features/redemption/components/RedemptionDrawer'
import { useQuotaPerUnit } from '@/hooks/use-server-status'
import { topUpInfoQuery } from '@/lib/api/topup'
import { formatDateTime, formatQuota } from '@/lib/format'

const DEFAULT_PAGE_SIZE = 20

/** Read at render time so a code that lapses while the page is open still reads as expired. */
function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

export function RedemptionCodesPage() {
  const { i18n, t } = useTranslation()
  const locale = i18n.language
  const quotaPerUnit = useQuotaPerUnit()
  const queryClient = useQueryClient()
  const access = useAdminAccess()

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState<RedemptionStatusFilter>('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState<RedemptionCode | undefined>(undefined)
  const [pendingDelete, setPendingDelete] = useState<RedemptionCode | null>(null)
  const [invalidDialogOpen, setInvalidDialogOpen] = useState(false)

  const isAdmin = access.state === 'granted'
  const listQuery = useQuery({
    ...redemptionsQuery({ keyword, status }, page, pageSize),
    enabled: isAdmin,
  })
  const codes = listQuery.data?.items
  const total = listQuery.data?.total

  /**
   * `payment_compliance_confirmed` from `GET /api/user/topup/info` — the same flag
   * `operation_setting.IsPaymentComplianceConfirmed()` reads, and the only place the
   * server exposes it outside the root-only option endpoint.
   *
   * In `controller/redemption.go` that check appears exactly once, at the top of
   * `AddRedemption`. Creating a batch is therefore refused while it is false;
   * editing, enabling, disabling and both delete paths are not gated and stay live.
   */
  const compliance = useQuery({ ...topUpInfoQuery(), enabled: isAdmin })
  const createLocked = compliance.data?.payment_compliance_confirmed === false

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['redemptions'] })
  }, [queryClient])

  const toggleMutation = useMutation({
    mutationFn: (input: { id: number; status: number }) =>
      updateRedemptionStatus(input.id, input.status),
    onSuccess: (_data, input) => {
      toast.success(
        input.status === REDEMPTION_STATUS.unused
          ? t('Redemption code enabled')
          : t('Redemption code disabled'),
      )
      refresh()
    },
    onError: (error: unknown) => toast.error(toErrorMessage(error)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteRedemption(id),
    onSuccess: () => {
      toast.success(t('Redemption code deleted'))
      setPendingDelete(null)
      refresh()
    },
    onError: (error: unknown) => toast.error(toErrorMessage(error)),
  })

  const deleteInvalidMutation = useMutation({
    mutationFn: deleteInvalidRedemptions,
    onSuccess: (rows) => {
      toast.success(t('Deleted {{count}} invalid redemption codes', { count: rows }))
      setInvalidDialogOpen(false)
      setPage(1)
      refresh()
    },
    onError: (error: unknown) => toast.error(toErrorMessage(error)),
  })

  const openCreate = useCallback(() => {
    setEditing(undefined)
    setDrawerOpen(true)
  }, [])

  const openEdit = useCallback((code: RedemptionCode) => {
    setEditing(code)
    setDrawerOpen(true)
  }, [])

  // `mutate` is referentially stable in react-query v5, so the column memo can depend
  // on it without rebuilding on every render.
  const toggleStatus = toggleMutation.mutate
  const pendingToggleId = toggleMutation.isPending ? toggleMutation.variables?.id : undefined

  const columns = useMemo<DataTableColumns<RedemptionCode>>(
    () => [
      {
        id: 'id',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('ID')} />,
        cell: ({ row }) => <MonoCell value={row.original.id} />,
        meta: { label: t('ID'), mono: true },
      },
      {
        id: 'name',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Name')} />,
        cell: ({ row }) => (
          <span className="font-semibold text-foreground">{row.original.name}</span>
        ),
        meta: { label: t('Name'), mobilePrimary: true },
      },
      {
        id: 'status',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Status')} />,
        cell: ({ row }) => {
          const state = redemptionState(row.original, nowSeconds())
          return (
            <StatusBadge tone={REDEMPTION_STATE_TONE[state]}>
              {t(REDEMPTION_STATE_LABEL[state])}
            </StatusBadge>
          )
        },
        meta: { label: t('Status') },
      },
      {
        id: 'key',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Code')} />,
        cell: ({ row }) => (
          <MaskedValue
            copyLabel={t('Copy the code for {{name}}', { name: row.original.name })}
            copyable
            hideLabel={t('Hide the code for {{name}}', { name: row.original.name })}
            showLabel={t('Reveal the code for {{name}}', { name: row.original.name })}
            size="sm"
            value={row.original.key}
          />
        ),
        meta: { label: t('Code') },
      },
      {
        id: 'quota',
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader align="right" column={column} title={t('Value')} />
        ),
        cell: ({ row }) => (
          <MonoCell align="right" value={formatQuota(row.original.quota, quotaPerUnit)} />
        ),
        meta: { align: 'right', label: t('Value'), mono: true },
      },
      {
        id: 'created_time',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Created')} />,
        cell: ({ row }) => <MonoCell value={formatDateTime(row.original.created_time, locale)} />,
        meta: { label: t('Created'), mono: true },
      },
      {
        id: 'expired_time',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Expires')} />,
        cell: ({ row }) => {
          const { expired_time: expiredTime } = row.original
          if (expiredTime === 0) return <BadgeCell label={t('Never')} tone="muted" />
          const lapsed = expiredTime < nowSeconds()
          return (
            <MonoCell
              tone={lapsed ? 'warning' : undefined}
              value={formatDateTime(expiredTime, locale)}
            />
          )
        },
        meta: { label: t('Expires'), mono: true },
      },
      {
        id: 'used_user_id',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Redeemed by')} />,
        cell: ({ row }) => {
          const { redeemed_time: redeemedTime, used_user_id: usedUserId } = row.original
          if (usedUserId === 0) return <MonoCell value={null} />
          return (
            <span className="flex flex-col gap-0.5">
              <span className="mono text-sm text-foreground">
                {t('User {{id}}', { id: usedUserId })}
              </span>
              {redeemedTime > 0 ? (
                <span className="mono text-xs text-muted">
                  {formatDateTime(redeemedTime, locale)}
                </span>
              ) : null}
            </span>
          )
        },
        // The API records only the numeric user id for a redeemer — there is no
        // username on this payload, so none is shown.
        meta: { label: t('Redeemed by') },
      },
      {
        id: 'actions',
        enableSorting: false,
        header: () => <span className="sr-only">{t('Actions')}</span>,
        cell: ({ row }) => {
          const code = row.original
          const seconds = nowSeconds()
          const enabled = code.status === REDEMPTION_STATUS.unused
          const actions: DataTableRowAction[] = [
            {
              disabled: !canEditRedemption(code, seconds),
              icon: <PencilIcon />,
              id: 'edit',
              label: t('Edit {{name}}', { name: code.name }),
              onClick: () => openEdit(code),
            },
            {
              busy: pendingToggleId === code.id,
              disabled: !canToggleRedemption(code, seconds),
              icon: enabled ? <PowerOffIcon /> : <PowerIcon />,
              id: 'toggle',
              label: enabled
                ? t('Disable {{name}}', { name: code.name })
                : t('Enable {{name}}', { name: code.name }),
              onClick: () =>
                toggleStatus({
                  id: code.id,
                  status: enabled ? REDEMPTION_STATUS.disabled : REDEMPTION_STATUS.unused,
                }),
            },
            {
              icon: <Trash2Icon />,
              id: 'delete',
              label: t('Delete {{name}}', { name: code.name }),
              onClick: () => setPendingDelete(code),
              tone: 'danger',
            },
          ]
          return <ActionsCell actions={actions} label={t('Actions for {{name}}', { name: code.name })} />
        },
        meta: { align: 'right', label: t('Actions') },
      },
    ],
    [locale, openEdit, pendingToggleId, quotaPerUnit, t, toggleStatus],
  )

  const { table, paginationControls } = useDataTable<RedemptionCode>({
    columns,
    data: codes,
    getRowId: (row) => String(row.id),
    onPageChange: (query) => {
      setPage(query.p)
      setPageSize(query.page_size)
    },
    page,
    pageSize,
    total,
  })

  const statusOptions: NativeSelectOption[] = [
    { value: '', label: t('All statuses') },
    { value: String(REDEMPTION_STATUS.unused), label: t('Unused') },
    { value: String(REDEMPTION_STATUS.disabled), label: t('Disabled') },
    { value: String(REDEMPTION_STATUS.used), label: t('Redeemed') },
    { value: REDEMPTION_EXPIRED_FILTER, label: t('Expired') },
  ]

  const hasActiveFilters = keyword !== '' || status !== ''
  const emptyTitle = hasActiveFilters ? t('No matching redemption codes') : t('No redemption codes yet')
  const emptyDescription = hasActiveFilters
    ? t('No code matches this search and status.')
    : t('Codes you create appear here with their value and redemption state.')

  if (access.state === 'checking') {
    return (
      <div aria-busy="true" className="flex flex-col gap-8" role="status">
        <span className="sr-only">{t('Checking your permissions')}</span>
        <PageHeader
          description={t('Generate and manage the prepaid codes users redeem for balance.')}
          title={t('Redemption codes')}
        />
      </div>
    )
  }

  if (access.state === 'unavailable') {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader
          description={t('Generate and manage the prepaid codes users redeem for balance.')}
          title={t('Redemption codes')}
        />
        <Alert
          action={
            <Button
              aria-busy={access.isRefetching}
              disabled={access.isRefetching}
              onClick={access.retry}
              variant="outline"
            >
              {t('Try again')}
            </Button>
          }
          icon={<TriangleAlertIcon aria-hidden="true" />}
          title={t('Could not confirm your permissions')}
          tone="destructive"
        >
          {toErrorMessage(access.error)}
        </Alert>
      </div>
    )
  }

  if (access.state === 'denied') {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader
          description={t('Generate and manage the prepaid codes users redeem for balance.')}
          title={t('Redemption codes')}
        />
        <Alert
          icon={<ShieldAlertIcon aria-hidden="true" />}
          title={t('Administrator access required')}
          tone="warning"
        >
          {t('Every redemption endpoint sits behind the administrator guard, so this page has nothing to show for your account.')}
        </Alert>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        action={
          <Button disabled={createLocked} onClick={openCreate} variant="primary">
            <PlusIcon aria-hidden="true" />
            {t('New codes')}
          </Button>
        }
        description={t('Generate and manage the prepaid codes users redeem for balance.')}
        title={t('Redemption codes')}
      />

      {createLocked ? (
        <Alert icon={<LockIcon aria-hidden="true" />} title={t('New codes cannot be generated')} tone="warning">
          {t('A root administrator has to accept the payment compliance terms before this deployment will issue redemption codes. Existing codes can still be edited, disabled and deleted.')}
        </Alert>
      ) : null}

      <Panel className="overflow-hidden">
        <DataTableToolbar
          actions={
            <Button onClick={() => setInvalidDialogOpen(true)} variant="danger">
              <Trash2Icon aria-hidden="true" />
              {t('Delete invalid codes')}
            </Button>
          }
          filters={
            <NativeSelect
              className="w-44"
              hideLabel
              label={t('Status')}
              onChange={(event) => {
                setStatus(event.target.value as RedemptionStatusFilter)
                setPage(1)
              }}
              options={statusOptions}
              size="sm"
              value={status}
            />
          }
          filtersLabel={t('Redemption code filters')}
          isResetDisabled={!hasActiveFilters}
          label={t('Redemption code filters')}
          onReset={() => {
            setKeyword('')
            setStatus('')
            setPage(1)
          }}
          search={
            <SearchInput
              debounceMs={300}
              description={t('Matches a numeric id exactly, or a name by prefix.')}
              hideLabel
              label={t('Search redemption codes')}
              onValueChange={(next) => {
                setKeyword(next)
                setPage(1)
              }}
              placeholder={t('Name or id')}
              size="sm"
              value={keyword}
            />
          }
        />

        {listQuery.isError ? (
          <div className="p-5">
            <Alert
              action={
                <Button
                  aria-busy={listQuery.isFetching}
                  disabled={listQuery.isFetching}
                  onClick={() => void listQuery.refetch()}
                  variant="outline"
                >
                  {t('Try again')}
                </Button>
              }
              icon={<TriangleAlertIcon aria-hidden="true" />}
              title={t('Could not load redemption codes')}
              tone="destructive"
            >
              {toErrorMessage(listQuery.error)}
            </Alert>
          </div>
        ) : (
          <>
            <DataTable
              className="hidden md:block"
              emptyAction={
                hasActiveFilters ? undefined : (
                  <Button disabled={createLocked} onClick={openCreate} variant="outline">
                    {t('New codes')}
                  </Button>
                )
              }
              emptyDescription={emptyDescription}
              emptyIcon={<TicketIcon aria-hidden="true" className="mx-auto size-7 text-muted" />}
              emptyTitle={emptyTitle}
              isFetching={listQuery.isFetching}
              isLoading={listQuery.isLoading}
              label={t('Redemption codes')}
              loadingLabel={t('Loading redemption codes')}
              minWidthClassName="min-w-[72rem]"
              table={table}
            />

            <div className="p-4 md:hidden">
              <MobileCardList
                emptyDescription={emptyDescription}
                emptyIcon={<TicketIcon aria-hidden="true" className="mx-auto size-7 text-muted" />}
                emptyTitle={emptyTitle}
                isFetching={listQuery.isFetching}
                isLoading={listQuery.isLoading}
                label={t('Redemption code cards')}
                loadingLabel={t('Loading redemption codes')}
                table={table}
              />
            </div>

            <DataTablePagination
              {...paginationControls}
              isFetching={listQuery.isFetching}
              label={t('Redemption code pages')}
            />
          </>
        )}
      </Panel>

      <RedemptionDrawer
        code={editing}
        onChanged={refresh}
        onOpenChange={(open) => {
          setDrawerOpen(open)
          if (!open) setEditing(undefined)
        }}
        open={drawerOpen}
      />

      <ConfirmDialog
        cancelLabel={t('Cancel')}
        confirmLabel={t('Delete code')}
        description={
          pendingDelete === null
            ? undefined
            : t('“{{name}}” (id {{id}}) is removed permanently. If it has not been redeemed, its value is lost.', {
              id: pendingDelete.id,
              name: pendingDelete.name,
            })
        }
        destructive
        isLoading={deleteMutation.isPending}
        onConfirm={() => {
          if (pendingDelete !== null) deleteMutation.mutate(pendingDelete.id)
        }}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        open={pendingDelete !== null}
        title={t('Delete this redemption code?')}
      />

      <ConfirmDialog
        cancelLabel={t('Cancel')}
        confirmLabel={t('Delete invalid codes')}
        description={t('This deletes every redeemed code, every disabled code, and every unused code whose expiry has passed.')}
        destructive
        isLoading={deleteInvalidMutation.isPending}
        onConfirm={() => deleteInvalidMutation.mutate()}
        onOpenChange={setInvalidDialogOpen}
        open={invalidDialogOpen}
        title={t('Delete all invalid redemption codes?')}
      >
        <Alert icon={<TriangleAlertIcon aria-hidden="true" />} tone="warning">
          {t('The search box and status filter do not narrow this: it runs across every code in the deployment and cannot be undone.')}
        </Alert>
      </ConfirmDialog>
    </div>
  )
}
