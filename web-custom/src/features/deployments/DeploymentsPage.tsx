import { useQuery, useQueryClient } from '@tanstack/react-query'
import ClockIcon from 'lucide-react/dist/esm/icons/clock'
import CpuIcon from 'lucide-react/dist/esm/icons/cpu'
import EllipsisIcon from 'lucide-react/dist/esm/icons/ellipsis'
import PencilIcon from 'lucide-react/dist/esm/icons/pencil'
import PlusIcon from 'lucide-react/dist/esm/icons/plus'
import ScrollTextIcon from 'lucide-react/dist/esm/icons/scroll-text'
import ServerIcon from 'lucide-react/dist/esm/icons/server'
import Settings2Icon from 'lucide-react/dist/esm/icons/settings-2'
import ShieldAlertIcon from 'lucide-react/dist/esm/icons/shield-alert'
import Trash2Icon from 'lucide-react/dist/esm/icons/trash-2'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  ActionsCell,
  DataTable,
  DataTableColumnHeader,
  DataTablePagination,
  DataTableToolbar,
  MobileCardList,
  MonoCell,
  TruncatedCell,
  useDataTable,
  type DataTableColumns,
} from '@/components/data'
import { NativeSelect, SearchInput, type NativeSelectOption } from '@/components/form'
import {
  ConfirmDialog,
  DropdownMenu,
  toErrorMessage,
  toast,
  type DropdownMenuItem,
} from '@/components/overlay'
import { Alert, Badge, Button, PageHeader, Panel, StatCard, StatusBadge } from '@/components/ui'
import {
  deleteDeployment,
  deploymentsQuery,
  EMPTY_DEPLOYMENT_FILTERS,
  hasActiveDeploymentFilters,
  type Deployment,
  type DeploymentFilters,
} from '@/features/deployments/api'
import { useDeploymentsAccess } from '@/features/deployments/access'
import { CreateDeploymentDrawer } from '@/features/deployments/components/CreateDeploymentDrawer'
import { DeploymentDetailDrawer } from '@/features/deployments/components/DeploymentDetailDrawer'
import { ExtendDeploymentDialog } from '@/features/deployments/components/ExtendDeploymentDialog'
import { IntegrationGuard } from '@/features/deployments/components/IntegrationGuard'
import { RenameDeploymentDialog } from '@/features/deployments/components/RenameDeploymentDialog'
import { UpdateConfigDrawer } from '@/features/deployments/components/UpdateConfigDrawer'
import {
  DEPLOYMENT_STATUSES,
  deploymentStatusLabel,
  deploymentStatusText,
  deploymentStatusTone,
  formatRemainingMinutes,
  hardwareSummary,
  remainingPercent,
} from '@/features/deployments/deployment-presentation'
import { useDeploymentIntegration } from '@/features/deployments/integration'
import { formatDateTime, formatNumber, formatPercent } from '@/lib/format'

const DEFAULT_PAGE_SIZE = 10

/** The row a dialog or drawer is currently pointed at. */
type Target = { id: string; name: string }

export function DeploymentsPage() {
  const { i18n, t } = useTranslation()
  const locale = i18n.language
  const queryClient = useQueryClient()
  const access = useDeploymentsAccess()
  const isAdmin = access.state === 'granted'

  const integration = useDeploymentIntegration(isAdmin)
  const isReady = integration.state.kind === 'ready'

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [filters, setFilters] = useState<DeploymentFilters>(EMPTY_DEPLOYMENT_FILTERS)
  const [createOpen, setCreateOpen] = useState(false)
  const [detailTarget, setDetailTarget] = useState<Target | null>(null)
  const [configTarget, setConfigTarget] = useState<Target | null>(null)
  const [renameTarget, setRenameTarget] = useState<Target | null>(null)
  const [extendTarget, setExtendTarget] = useState<Target | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Target | null>(null)
  const [deleting, setDeleting] = useState(false)

  const listQuery = useQuery({
    ...deploymentsQuery(filters, page, pageSize),
    enabled: isAdmin && isReady,
  })
  const items = listQuery.data?.items
  const total = listQuery.data?.total
  const statusCounts = listQuery.data?.status_counts

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['deployments'] })
  }, [queryClient])

  /**
   * `mapIoNetDeployment` copies io.net's cluster name straight through, and io.net does
   * not guarantee one. A row without a name falls back to its id so that every dialog
   * title, every accessible action name and — above all — the type-to-confirm gate on
   * termination still names something the operator can read and match.
   */
  const targetOf = useCallback(
    (row: Deployment): Target => ({
      id: row.id,
      name: row.deployment_name.trim() === '' ? row.id : row.deployment_name,
    }),
    [],
  )

  const openDetail = useCallback(
    (row: Deployment) => setDetailTarget(targetOf(row)),
    [targetOf],
  )

  const columns = useMemo<DataTableColumns<Deployment>>(
    () => [
      {
        accessorKey: 'id',
        enableSorting: false,
        id: 'id',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('ID')} />,
        cell: ({ row }) => <TruncatedCell maxWidthClassName="max-w-[16rem]" mono value={row.original.id} />,
        meta: { hideOnMobile: true, label: t('ID'), mono: true },
      },
      {
        accessorKey: 'deployment_name',
        enableSorting: false,
        id: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Name')} />,
        cell: ({ row }) => (
          <TruncatedCell maxWidthClassName="max-w-[18rem]" mono value={targetOf(row.original).name} />
        ),
        meta: { label: t('Name'), mobilePrimary: true },
      },
      {
        accessorKey: 'status',
        enableSorting: false,
        id: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Status')} />,
        cell: ({ row }) => (
          <StatusBadge tone={deploymentStatusTone(row.original.status)}>
            {deploymentStatusText(row.original.status, t)}
          </StatusBadge>
        ),
        meta: { label: t('Status') },
      },
      {
        enableSorting: false,
        id: 'hardware',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Hardware')} />,
        cell: ({ row }) => {
          const summary = hardwareSummary(
            row.original.brand_name,
            row.original.hardware_name,
            row.original.hardware_quantity,
          )
          return <MonoCell value={summary === '' ? row.original.hardware_info : summary} />
        },
        meta: { label: t('Hardware'), mono: true },
      },
      {
        enableSorting: false,
        id: 'remaining',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Time remaining')} />,
        cell: ({ row }) => {
          const converted = formatRemainingMinutes(row.original.compute_minutes_remaining)
          const left = remainingPercent(row.original.completed_percent)
          return (
            <span className="flex min-w-0 flex-col gap-1">
              <span className="mono text-sm text-foreground">
                {converted ?? row.original.time_remaining}
              </span>
              {left === null ? null : (
                <span className="text-xs text-muted">
                  {t('{{percent}} of the paid window left (derived: 100 − completed_percent)', {
                    percent: formatPercent(left, 0),
                  })}
                </span>
              )}
            </span>
          )
        },
        meta: { label: t('Time remaining') },
      },
      {
        accessorKey: 'created_at',
        enableSorting: false,
        id: 'created_at',
        header: ({ column }) => (
          <DataTableColumnHeader align="right" column={column} title={t('Created')} />
        ),
        cell: ({ row }) => (
          <MonoCell align="right" value={formatDateTime(row.original.created_at, locale)} />
        ),
        meta: { align: 'right', label: t('Created'), mono: true },
      },
      {
        enableSorting: false,
        id: 'actions',
        header: () => <span className="sr-only">{t('Actions')}</span>,
        cell: ({ row }) => {
          const deployment = row.original
          const target = targetOf(deployment)
          const menuItems: DropdownMenuItem[] = [
            {
              icon: <ScrollTextIcon aria-hidden="true" />,
              id: 'details',
              label: t('Details, containers and logs'),
              onSelect: () => openDetail(deployment),
            },
            {
              icon: <Settings2Icon aria-hidden="true" />,
              id: 'config',
              label: t('Update configuration'),
              onSelect: () => setConfigTarget(target),
            },
            {
              icon: <PencilIcon aria-hidden="true" />,
              id: 'rename',
              label: t('Rename'),
              onSelect: () => setRenameTarget(target),
            },
            {
              icon: <ClockIcon aria-hidden="true" />,
              id: 'extend',
              label: t('Extend (costs money)'),
              onSelect: () => setExtendTarget(target),
              separatorBefore: true,
            },
            {
              destructive: true,
              icon: <Trash2Icon aria-hidden="true" />,
              id: 'delete',
              label: t('Terminate'),
              onSelect: () => setDeleteTarget(target),
              separatorBefore: true,
            },
          ]

          return (
            <ActionsCell label={t('Actions for {{name}}', { name: target.name })}>
              <DropdownMenu
                align="end"
                items={menuItems}
                label={t('More actions for {{name}}', { name: target.name })}
                trigger={
                  <Button
                    aria-label={t('More actions for {{name}}', { name: target.name })}
                    size="icon-md"
                    title={t('More actions for {{name}}', { name: target.name })}
                    variant="quiet"
                  >
                    <EllipsisIcon aria-hidden="true" />
                  </Button>
                }
              />
            </ActionsCell>
          )
        },
        meta: { align: 'right', label: t('Actions') },
      },
    ],
    [locale, openDetail, t, targetOf],
  )

  const { table, paginationControls } = useDataTable<Deployment>({
    columns,
    data: items,
    getRowId: (row) => row.id,
    onPageChange: (query) => {
      setPage(query.p)
      setPageSize(query.page_size)
    },
    page,
    pageSize,
    total,
  })

  const pageTitle = t('GPU deployments')
  const pageDescription = t('Container clusters rented from io.net: what is running, how much compute is left on each and what it costs to keep them alive.')

  if (access.state === 'checking') {
    return (
      <div aria-busy="true" className="flex flex-col gap-8" role="status">
        <span className="sr-only">{t('Checking your permissions')}</span>
        <PageHeader description={pageDescription} title={pageTitle} />
      </div>
    )
  }

  if (access.state === 'unavailable') {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader description={pageDescription} title={pageTitle} />
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
        <PageHeader description={pageDescription} title={pageTitle} />
        <Alert
          icon={<ShieldAlertIcon aria-hidden="true" />}
          title={t('Administrator access required')}
          tone="warning"
        >
          {t('Every deployment endpoint sits behind the administrator guard, so this page has nothing to show for your account.')}
        </Alert>
      </div>
    )
  }

  if (integration.state.kind !== 'ready') {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader description={pageDescription} title={pageTitle} />
        <IntegrationGuard
          isRechecking={integration.isRechecking}
          onRecheck={integration.recheck}
          state={integration.state}
        />
      </div>
    )
  }

  const connection = integration.state.connection
  const filtered = hasActiveDeploymentFilters(filters)
  const searching = filters.keyword.trim() !== ''

  const statusOptions: NativeSelectOption[] = [
    { label: t('Any status'), value: '' },
    ...DEPLOYMENT_STATUSES.map((status) => {
      const label = t(deploymentStatusLabel(status))
      const count = statusCounts?.[status]
      return {
        label: count === undefined ? label : `${label} (${formatNumber(count)})`,
        value: status,
      }
    }),
  ]

  const emptyTitle = filtered ? t('No matching deployments') : t('No deployments yet')
  const emptyDescription = filtered
    ? t('No cluster on this page matches the search and the status facet.')
    : t('This io.net account has no clusters. Creating one rents GPU capacity and starts charging immediately.')

  const updateFilters = (patch: Partial<DeploymentFilters>) => {
    setFilters((previous) => ({ ...previous, ...patch }))
    setPage(1)
  }

  const runDelete = async () => {
    if (deleteTarget === null) return
    setDeleting(true)
    try {
      const result = await deleteDeployment(deleteTarget.id)
      toast.success(result.message)
      refresh()
      setDeleteTarget(null)
    } catch (error: unknown) {
      toast.error(toErrorMessage(error))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        action={
          <Button onClick={() => setCreateOpen(true)} variant="primary">
            <PlusIcon aria-hidden="true" />
            {t('New deployment')}
          </Button>
        }
        description={pageDescription}
        eyebrow={t('io.net')}
        title={pageTitle}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          icon={<ServerIcon aria-hidden="true" />}
          label={t('Hardware types visible to this account')}
          value={formatNumber(connection.hardware_count)}
        />
        <StatCard
          icon={<CpuIcon aria-hidden="true" />}
          label={t('GPU units io.net reports free')}
          value={formatNumber(connection.total_available)}
        />
      </div>

      <Panel className="overflow-hidden">
        <DataTableToolbar
          filters={
            <NativeSelect
              className="w-56"
              hideLabel
              label={t('Status')}
              onChange={(event) => updateFilters({ status: event.target.value })}
              options={statusOptions}
              size="sm"
              value={filters.status}
            />
          }
          filtersLabel={t('Deployment facets')}
          isResetDisabled={!filtered}
          label={t('Deployment filters')}
          onReset={() => {
            setFilters(EMPTY_DEPLOYMENT_FILTERS)
            setPage(1)
          }}
          search={
            <SearchInput
              debounceMs={300}
              description={t('Matches part of a cluster name, within the current page only.')}
              hideLabel
              label={t('Search deployments')}
              onValueChange={(next) => updateFilters({ keyword: next })}
              placeholder={t('Cluster name')}
              size="sm"
              value={filters.keyword}
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
              title={t('Could not load the deployments')}
              tone="destructive"
            >
              <span className="mono block break-words text-xs leading-5">
                {toErrorMessage(listQuery.error)}
              </span>
            </Alert>
          </div>
        ) : (
          <>
            <DataTable
              className="hidden md:block"
              emptyAction={
                filtered ? undefined : (
                  <Button onClick={() => setCreateOpen(true)} variant="outline">
                    {t('New deployment')}
                  </Button>
                )
              }
              emptyDescription={emptyDescription}
              emptyIcon={<ServerIcon aria-hidden="true" className="mx-auto size-7 text-muted" />}
              emptyTitle={emptyTitle}
              isFetching={listQuery.isFetching}
              isLoading={listQuery.isLoading}
              label={t('GPU deployments')}
              loadingLabel={t('Loading the deployments')}
              minWidthClassName="min-w-[72rem]"
              table={table}
            />

            <div className="p-4 md:hidden">
              <MobileCardList
                emptyDescription={emptyDescription}
                emptyIcon={<ServerIcon aria-hidden="true" className="mx-auto size-7 text-muted" />}
                emptyTitle={emptyTitle}
                isFetching={listQuery.isFetching}
                isLoading={listQuery.isLoading}
                label={t('Deployment cards')}
                loadingLabel={t('Loading the deployments')}
                table={table}
              />
            </div>

            <DataTablePagination
              {...paginationControls}
              isFetching={listQuery.isFetching}
              label={t('Deployment pages')}
            />
          </>
        )}
      </Panel>

      <div className="flex flex-col gap-2 text-xs leading-5 text-muted">
        <p>
          {t('Both list routes sort newest first at io.net and accept no sort parameters, so no column here is sortable.')}
        </p>
        <p>
          {searching
            ? t('Search runs after pagination: the server fetches one page from io.net and then filters that page by name, so a match on another page is not found. Clear the search to page through everything.')
            : t('The counts beside each status describe the deployments on THIS page only — the server tallies the page it just fetched. The total under the table is the collection total.')}
        </p>
        <p>
          {t('Creating a deployment and extending one both rent paid GPU capacity from io.net. Terminating one is irreversible.')}
        </p>
      </div>

      <CreateDeploymentDrawer
        onCreated={refresh}
        onOpenChange={setCreateOpen}
        open={createOpen}
      />

      <DeploymentDetailDrawer
        deploymentId={detailTarget?.id}
        deploymentName={detailTarget?.name}
        onOpenChange={(open) => {
          if (!open) setDetailTarget(null)
        }}
        open={detailTarget !== null}
      />

      <UpdateConfigDrawer
        deploymentId={configTarget?.id}
        onOpenChange={(open) => {
          if (!open) setConfigTarget(null)
        }}
        onUpdated={refresh}
        open={configTarget !== null}
      />

      <RenameDeploymentDialog
        currentName={renameTarget?.name ?? ''}
        deploymentId={renameTarget?.id}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null)
        }}
        onRenamed={refresh}
        open={renameTarget !== null}
      />

      <ExtendDeploymentDialog
        deploymentId={extendTarget?.id}
        onExtended={refresh}
        onOpenChange={(open) => {
          if (!open) setExtendTarget(null)
        }}
        open={extendTarget !== null}
      />

      <ConfirmDialog
        cancelLabel={t('Cancel')}
        confirmLabel={t('Terminate this deployment')}
        confirmPhrase={deleteTarget?.name}
        description={
          deleteTarget === null
            ? undefined
            : t('“{{name}}” is terminated at io.net. Its containers stop, its compute is released and it cannot be brought back. Compute already paid for is not refunded by this console.', { name: deleteTarget.name })
        }
        destructive
        isLoading={deleting}
        onConfirm={() => void runDelete()}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null)
        }}
        open={deleteTarget !== null}
        title={t('Terminate this deployment permanently?')}
      >
        {deleteTarget === null ? null : (
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="eyebrow">{t('ID')}</span>
            <Badge className="mono" size="sm" tone="muted">{deleteTarget.id}</Badge>
          </p>
        )}
      </ConfirmDialog>
    </div>
  )
}
