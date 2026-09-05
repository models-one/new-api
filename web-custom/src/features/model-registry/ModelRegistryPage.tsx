import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import BoxesIcon from 'lucide-react/dist/esm/icons/boxes'
import DownloadCloudIcon from 'lucide-react/dist/esm/icons/download-cloud'
import EllipsisIcon from 'lucide-react/dist/esm/icons/ellipsis'
import EyeIcon from 'lucide-react/dist/esm/icons/eye'
import PencilIcon from 'lucide-react/dist/esm/icons/pencil'
import PlusIcon from 'lucide-react/dist/esm/icons/plus'
import PowerIcon from 'lucide-react/dist/esm/icons/power'
import PowerOffIcon from 'lucide-react/dist/esm/icons/power-off'
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
  type DataTableRowAction,
} from '@/components/data'
import { NativeSelect, SearchInput, type NativeSelectOption } from '@/components/form'
import {
  ConfirmDialog,
  DropdownMenu,
  toErrorMessage,
  toast,
  Tooltip,
  type DropdownMenuItem,
} from '@/components/overlay'
import { Alert, Badge, Button, PageHeader, Panel, StatusBadge } from '@/components/ui'
import { useModelRegistryAccess } from '@/features/model-registry/access'
import {
  deleteRegistryModel,
  EMPTY_REGISTRY_FILTERS,
  hasActiveRegistryFilters,
  missingModelsQuery,
  registryModelsQuery,
  setRegistryModelStatus,
  vendorsQuery,
  type RegistryFilters,
  type RegistryModel,
} from '@/features/model-registry/api'
import { MissingModelsPanel } from '@/features/model-registry/components/MissingModelsPanel'
import { ModelDetailDialog } from '@/features/model-registry/components/ModelDetailDialog'
import { ModelDrawer } from '@/features/model-registry/components/ModelDrawer'
import { SyncDialog } from '@/features/model-registry/components/SyncDialog'
import {
  modelStatusLabel,
  modelStatusTone,
  MODEL_STATUS,
  nameRuleDescription,
  nameRuleLabel,
  nameRuleTone,
  NAME_RULE,
  parseEndpoints,
  parseTags,
  vendorName,
} from '@/features/model-registry/model-registry-presentation'
import { formatDateTime, formatNumber } from '@/lib/format'

const DEFAULT_PAGE_SIZE = 20

/** How many chips a cell shows before it collapses the rest into a "+N". */
const CHIP_LIMIT = 3

type PendingDelete = { id: number; name: string }

export function ModelRegistryPage() {
  const { i18n, t } = useTranslation()
  const locale = i18n.language
  const queryClient = useQueryClient()
  const access = useModelRegistryAccess()

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [filters, setFilters] = useState<RegistryFilters>(EMPTY_REGISTRY_FILTERS)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | undefined>(undefined)
  const [presetName, setPresetName] = useState<string | undefined>(undefined)
  const [detailId, setDetailId] = useState<number | undefined>(undefined)
  const [syncOpen, setSyncOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)

  const isAdmin = access.state === 'granted'

  const listQuery = useQuery({
    ...registryModelsQuery(filters, page, pageSize),
    enabled: isAdmin,
  })
  const models = listQuery.data?.items
  const total = listQuery.data?.total
  const vendorCounts = listQuery.data?.vendor_counts

  const vendors = useQuery({ ...vendorsQuery(), enabled: isAdmin })
  const missing = useQuery({ ...missingModelsQuery(), enabled: isAdmin })

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['model-registry'] })
  }, [queryClient])

  const statusMutation = useMutation({
    mutationFn: (input: { id: number; status: number }) =>
      setRegistryModelStatus(input.id, input.status),
    onSuccess: (_data, input) => {
      toast.success(
        input.status === MODEL_STATUS.enabled
          ? t('Model definition enabled')
          : t('Model definition disabled'),
      )
      refresh()
    },
    onError: (error: unknown) => toast.error(toErrorMessage(error)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteRegistryModel(id),
    onSuccess: () => {
      toast.success(t('Model definition deleted'))
      setPendingDelete(null)
      refresh()
    },
    onError: (error: unknown) => {
      toast.error(toErrorMessage(error))
      setPendingDelete(null)
    },
  })

  const openCreate = useCallback((name?: string) => {
    setEditingId(undefined)
    setPresetName(name)
    setDrawerOpen(true)
  }, [])

  const openEdit = useCallback((model: RegistryModel) => {
    setEditingId(model.id)
    setPresetName(undefined)
    setDrawerOpen(true)
  }, [])

  const vendorList = vendors.data
  const statusMutationPending = statusMutation.isPending
  /** Stable across renders (React Query keeps `mutate` identity), so the columns are not
   *  rebuilt on every render just to close over the mutation. */
  const runStatus = statusMutation.mutate

  const columns = useMemo<DataTableColumns<RegistryModel>>(
    () => [
      {
        accessorKey: 'id',
        id: 'id',
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader align="right" column={column} title={t('ID')} />
        ),
        cell: ({ row }) => <MonoCell align="right" value={row.original.id} />,
        meta: { align: 'right', label: t('ID'), mono: true },
      },
      {
        accessorKey: 'model_name',
        id: 'model_name',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Model')} />,
        cell: ({ row }) => {
          const model = row.original
          const ruleLabel = nameRuleLabel(model.name_rule)
          const matched = model.matched_count ?? 0
          return (
            <div className="flex min-w-0 flex-col gap-1">
              <span className="mono truncate font-medium text-foreground">{model.model_name}</span>
              <span className="flex flex-wrap items-center gap-1.5">
                <Tooltip
                  content={
                    ruleLabel === ''
                      ? t('Unknown match rule {{code}}', { code: model.name_rule })
                      : t(nameRuleDescription(model.name_rule))
                  }
                >
                  <Badge size="sm" tone={nameRuleTone(model.name_rule)}>
                    {ruleLabel === ''
                      ? t('Rule {{code}}', { code: model.name_rule })
                      : t(ruleLabel)}
                  </Badge>
                </Tooltip>
                {model.name_rule === NAME_RULE.exact ? null : (
                  <span className="mono text-[0.6875rem] text-muted">
                    {t('{{count}} matched', { count: matched })}
                  </span>
                )}
              </span>
            </div>
          )
        },
        meta: { label: t('Model') },
      },
      {
        id: 'vendor',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Vendor')} />,
        cell: ({ row }) => {
          const name = vendorName(vendorList ?? [], row.original.vendor_id)
          if (name === undefined) {
            return (
              <MonoCell
                fallback={vendorList === undefined ? t('Loading…') : t('None')}
                value={null}
              />
            )
          }
          return <TruncatedCell maxWidthClassName="max-w-[140px]" value={name} />
        },
        meta: { label: t('Vendor') },
      },
      {
        accessorKey: 'status',
        id: 'status',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Status')} />,
        cell: ({ row }) => {
          const label = modelStatusLabel(row.original.status)
          return (
            <StatusBadge size="sm" tone={modelStatusTone(row.original.status)}>
              {label === ''
                ? t('Status {{code}}', { code: row.original.status })
                : t(label)}
            </StatusBadge>
          )
        },
        meta: { label: t('Status') },
      },
      {
        id: 'sync_official',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Upstream')} />,
        cell: ({ row }) => (
          <Badge size="sm" tone={row.original.sync_official === 0 ? 'muted' : 'info'}>
            {row.original.sync_official === 0 ? t('Pinned') : t('Follows')}
          </Badge>
        ),
        meta: { hideOnMobile: true, label: t('Upstream') },
      },
      {
        id: 'tags',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Tags')} />,
        cell: ({ row }) => <ChipList items={parseTags(row.original.tags)} />,
        meta: { hideOnMobile: true, label: t('Tags') },
      },
      {
        id: 'endpoints',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Endpoints')} />,
        cell: ({ row }) => <ChipList items={parseEndpoints(row.original.endpoints)} />,
        meta: { hideOnMobile: true, label: t('Endpoints') },
      },
      {
        id: 'bound_channels',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Channels')} />,
        cell: ({ row }) => (
          <ChipList items={(row.original.bound_channels ?? []).map((channel) => channel.name)} />
        ),
        meta: { hideOnMobile: true, label: t('Channels') },
      },
      {
        id: 'enable_groups',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Groups')} />,
        cell: ({ row }) => <ChipList items={row.original.enable_groups ?? []} />,
        meta: { hideOnMobile: true, label: t('Groups') },
      },
      {
        accessorKey: 'updated_time',
        id: 'updated_time',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Updated')} />,
        cell: ({ row }) => (
          <MonoCell value={formatDateTime(row.original.updated_time, locale)} />
        ),
        meta: { hideOnMobile: true, label: t('Updated') },
      },
      {
        id: 'actions',
        enableSorting: false,
        header: () => <span className="sr-only">{t('Actions')}</span>,
        cell: ({ row }) => {
          const model = row.original
          const enabled = model.status === MODEL_STATUS.enabled

          const actions: DataTableRowAction[] = [
            {
              icon: <EyeIcon />,
              id: 'detail',
              label: t('Inspect {{name}}', { name: model.model_name }),
              onClick: () => setDetailId(model.id),
            },
            {
              icon: <PencilIcon />,
              id: 'edit',
              label: t('Edit {{name}}', { name: model.model_name }),
              onClick: () => openEdit(model),
            },
          ]

          const menuItems: DropdownMenuItem[] = [
            {
              disabled: enabled || statusMutationPending,
              icon: <PowerIcon />,
              id: 'enable',
              label: t('Enable'),
              onSelect: () => runStatus({ id: model.id, status: MODEL_STATUS.enabled }),
            },
            {
              disabled: !enabled || statusMutationPending,
              icon: <PowerOffIcon />,
              id: 'disable',
              label: t('Disable'),
              onSelect: () => runStatus({ id: model.id, status: MODEL_STATUS.disabled }),
            },
            {
              destructive: true,
              icon: <Trash2Icon />,
              id: 'delete',
              label: t('Delete definition'),
              separatorBefore: true,
              onSelect: () => setPendingDelete({ id: model.id, name: model.model_name }),
            },
          ]

          const menuLabel = t('More actions for {{name}}', { name: model.model_name })

          return (
            <ActionsCell
              actions={actions}
              label={t('Actions for {{name}}', { name: model.model_name })}
            >
              <DropdownMenu
                items={menuItems}
                trigger={
                  <Button aria-label={menuLabel} size="icon-md" title={menuLabel} variant="quiet">
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
    [locale, openEdit, runStatus, statusMutationPending, t, vendorList],
  )

  const { table, paginationControls } = useDataTable<RegistryModel>({
    columns,
    data: models,
    getRowId: (row) => String(row.id),
    onPageChange: (query) => {
      setPage(query.p)
      setPageSize(query.page_size)
    },
    page,
    pageSize,
    total,
  })

  const updateFilters = (next: Partial<RegistryFilters>) => {
    setFilters((previous) => ({ ...previous, ...next }))
    setPage(1)
  }

  const pageTitle = t('Model registry')
  const pageDescription = t('The definitions behind every model name this gateway publishes: the match rule, the vendor, the tags and whether the official upstream may overwrite them.')

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
          {t('The whole model registry sits behind the administrator guard, so this page has nothing to show for your account. The published catalogue with prices is on the Models page instead.')}
        </Alert>
      </div>
    )
  }

  const filtered = hasActiveRegistryFilters(filters)
  const emptyTitle = filtered ? t('No matching definitions') : t('No model definitions yet')
  const emptyDescription = filtered
    ? t('No definition matches this search and these facets.')
    : t('Nothing is defined yet. Sync from upstream to import the public metadata, or write a definition by hand.')

  const statusOptions: NativeSelectOption[] = [
    { label: t('Any status'), value: '' },
    { label: t('Enabled'), value: 'enabled' },
    { label: t('Disabled'), value: 'disabled' },
  ]

  const syncOptions: NativeSelectOption[] = [
    { label: t('Any upstream setting'), value: '' },
    { label: t('Follows upstream'), value: 'yes' },
    { label: t('Pinned locally'), value: 'no' },
  ]

  const vendorOptions: NativeSelectOption[] = [
    { label: t('Any vendor'), value: '' },
    {
      label: vendorCounts === undefined
        ? t('No vendor')
        : `${t('No vendor')} (${formatNumber(vendorCounts['0'] ?? 0)})`,
      value: '0',
    },
    ...(vendorList ?? []).map((vendor) => ({
      label: vendorCounts === undefined
        ? vendor.name
        : `${vendor.name} (${formatNumber(vendorCounts[String(vendor.id)] ?? 0)})`,
      value: String(vendor.id),
    })),
  ]

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        action={
          <>
            <Button onClick={() => setSyncOpen(true)} variant="outline">
              <DownloadCloudIcon aria-hidden="true" />
              {t('Sync from upstream')}
            </Button>
            <Button onClick={() => openCreate()} variant="primary">
              <PlusIcon aria-hidden="true" />
              {t('New definition')}
            </Button>
          </>
        }
        description={pageDescription}
        title={pageTitle}
      />

      <MissingModelsPanel
        onDefine={(name) => openCreate(name)}
        onSync={() => setSyncOpen(true)}
        query={missing}
      />

      <Panel className="overflow-hidden">
        <DataTableToolbar
          filters={
            <>
              <NativeSelect
                className="w-40"
                hideLabel
                label={t('Status')}
                onChange={(event) => updateFilters({ status: event.target.value })}
                options={statusOptions}
                size="sm"
                value={filters.status}
              />
              <NativeSelect
                className="w-48"
                disabled={vendorList === undefined}
                hideLabel
                label={t('Vendor')}
                onChange={(event) => updateFilters({ vendor: event.target.value })}
                options={vendorOptions}
                size="sm"
                value={filters.vendor}
              />
              <NativeSelect
                className="w-52"
                hideLabel
                label={t('Upstream setting')}
                onChange={(event) => updateFilters({ sync_official: event.target.value })}
                options={syncOptions}
                size="sm"
                value={filters.sync_official}
              />
            </>
          }
          filtersLabel={t('Definition facets')}
          isResetDisabled={!filtered}
          label={t('Model definition filters')}
          onReset={() => {
            setFilters(EMPTY_REGISTRY_FILTERS)
            setPage(1)
          }}
          search={
            <SearchInput
              debounceMs={300}
              description={t('Matches part of a model name, a description or a tag.')}
              hideLabel
              label={t('Search model definitions')}
              onValueChange={(next) => updateFilters({ keyword: next })}
              placeholder={t('Name, description or tag')}
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
              title={t('Could not load the model definitions')}
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
                filtered ? undefined : (
                  <Button onClick={() => openCreate()} variant="outline">
                    {t('New definition')}
                  </Button>
                )
              }
              emptyDescription={emptyDescription}
              emptyIcon={<BoxesIcon aria-hidden="true" className="mx-auto size-7 text-muted" />}
              emptyTitle={emptyTitle}
              isFetching={listQuery.isFetching}
              isLoading={listQuery.isLoading}
              label={t('Model definitions')}
              loadingLabel={t('Loading model definitions')}
              minWidthClassName="min-w-[86rem]"
              table={table}
            />

            <div className="p-4 md:hidden">
              <MobileCardList
                emptyDescription={emptyDescription}
                emptyIcon={<BoxesIcon aria-hidden="true" className="mx-auto size-7 text-muted" />}
                emptyTitle={emptyTitle}
                isFetching={listQuery.isFetching}
                isLoading={listQuery.isLoading}
                label={t('Model definition cards')}
                loadingLabel={t('Loading model definitions')}
                table={table}
              />
            </div>

            <DataTablePagination
              {...paginationControls}
              isFetching={listQuery.isFetching}
              label={t('Model definition pages')}
            />
          </>
        )}
      </Panel>

      <p className="text-xs leading-5 text-muted">
        {t('Channels, groups, billing shape and the names a rule matched are recomputed by the server on every read and cannot be edited here. The endpoint list is filled in the same way whenever nothing is stored, so what you see may be derived rather than saved.')}
      </p>

      <ModelDrawer
        modelId={editingId}
        onChanged={refresh}
        onOpenChange={(open) => {
          setDrawerOpen(open)
          if (!open) {
            setEditingId(undefined)
            setPresetName(undefined)
          }
        }}
        open={drawerOpen}
        presetName={presetName}
      />

      <ModelDetailDialog
        modelId={detailId}
        onOpenChange={(open) => {
          if (!open) setDetailId(undefined)
        }}
        open={detailId !== undefined}
      />

      <SyncDialog onApplied={refresh} onOpenChange={setSyncOpen} open={syncOpen} />

      <ConfirmDialog
        cancelLabel={t('Cancel')}
        confirmLabel={t('Delete definition')}
        confirmPhrase={pendingDelete?.name}
        description={
          pendingDelete === null
            ? undefined
            : t('“{{name}}” loses its description, vendor, tags and match rule. The model keeps relaying — it simply becomes undefined again, and reappears in the list above.', { name: pendingDelete.name })
        }
        destructive
        isLoading={deleteMutation.isPending}
        onConfirm={() => {
          if (pendingDelete !== null) deleteMutation.mutate(pendingDelete.id)
        }}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) setPendingDelete(null)
        }}
        open={pendingDelete !== null}
        title={t('Delete this model definition?')}
      />
    </div>
  )
}

/** A short chip run with the overflow collapsed, so a wide column stays readable. */
function ChipList(props: { items: string[] }) {
  const { t } = useTranslation()
  if (props.items.length === 0) return <MonoCell value={null} />

  const shown = props.items.slice(0, CHIP_LIMIT)
  const hidden = props.items.length - shown.length

  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((item) => (
        <Badge className="mono" key={item} size="sm" tone="muted">{item}</Badge>
      ))}
      {hidden === 0 ? null : (
        <Tooltip content={props.items.slice(CHIP_LIMIT).join(', ')}>
          <span className="mono text-[0.6875rem] text-muted">
            {t('+{{count}} more', { count: hidden })}
          </span>
        </Tooltip>
      )}
    </div>
  )
}
