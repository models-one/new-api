import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import ActivityIcon from 'lucide-react/dist/esm/icons/activity'
import CoinsIcon from 'lucide-react/dist/esm/icons/coins'
import CopyIcon from 'lucide-react/dist/esm/icons/copy'
import EllipsisIcon from 'lucide-react/dist/esm/icons/ellipsis'
import PencilIcon from 'lucide-react/dist/esm/icons/pencil'
import PlugZapIcon from 'lucide-react/dist/esm/icons/plug-zap'
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
import {
  Checkbox,
  Input,
  NativeSelect,
  SearchInput,
  type CheckboxState,
  type NativeSelectOption,
} from '@/components/form'
import {
  ConfirmDialog,
  DropdownMenu,
  toErrorMessage,
  toast,
  Tooltip,
  type DropdownMenuItem,
} from '@/components/overlay'
import { Alert, Badge, Button, PageHeader, Panel, StatusBadge } from '@/components/ui'
import { useChannelsAccess } from '@/features/channels/access'
import {
  channelGroupNamesQuery,
  channelsQuery,
  copyChannel,
  deleteChannel,
  deleteChannelsBatch,
  EMPTY_CHANNEL_FILTERS,
  hasActiveChannelFilters,
  isChannelSortColumn,
  refreshChannelBalance,
  setChannelStatus,
  setChannelStatusBatch,
  testChannel,
  type Channel,
  type ChannelFilters,
} from '@/features/channels/api'
import {
  channelStatusLabel,
  channelStatusReason,
  channelStatusTone,
  channelTypeName,
  channelTypeOptions,
  CHANNEL_STATUS,
  responseTimeTone,
  splitList,
  SUPPORTS_BALANCE_TYPES,
} from '@/features/channels/channel-presentation'
import { ChannelDrawer } from '@/features/channels/components/ChannelDrawer'
import { formatCurrency, formatDateTime, formatNumber } from '@/lib/format'

const DEFAULT_PAGE_SIZE = 20

/** The tri-state a header checkbox needs: all, some, or none of the page selected. */
function selectAllState(all: boolean, some: boolean): CheckboxState {
  if (all) return true
  return some ? 'indeterminate' : false
}

/** The outcome of a test run in THIS session, kept beside the row it belongs to. */
type TestOutcome = {
  ok: boolean
  message: string
  seconds: number
  errorCode?: string
}

type PendingBatch =
  | { kind: 'enable' | 'disable' | 'delete' | 'test'; ids: number[] }
  | { kind: 'delete-one'; ids: number[]; name: string }

type BatchReport = {
  title: string
  succeeded: number
  failed: number
  failures: string[]
}

export function ChannelsPage() {
  const { i18n, t } = useTranslation()
  const locale = i18n.language
  const queryClient = useQueryClient()
  const access = useChannelsAccess()

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [filters, setFilters] = useState<ChannelFilters>(EMPTY_CHANNEL_FILTERS)
  const [sortBy, setSortBy] = useState<string | undefined>(undefined)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | undefined>(undefined)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | undefined>(undefined)
  const [selection, setSelection] = useState<Record<string, boolean>>({})
  const [pending, setPending] = useState<PendingBatch | null>(null)
  const [report, setReport] = useState<BatchReport | null>(null)
  const [outcomes, setOutcomes] = useState<Record<number, TestOutcome>>({})
  const [busyRow, setBusyRow] = useState<{ id: number; job: 'test' | 'balance' } | null>(null)
  const [batchRunning, setBatchRunning] = useState(false)

  const isAdmin = access.state === 'granted'
  const can = access.can

  const sort = useMemo(
    () => (sortBy === undefined ? {} : { sort_by: sortBy, sort_order: sortOrder }),
    [sortBy, sortOrder],
  )

  const listQuery = useQuery({
    ...channelsQuery(filters, page, pageSize, sort),
    enabled: isAdmin && can.read,
  })
  const channels = listQuery.data?.items
  const total = listQuery.data?.total
  const typeCounts = listQuery.data?.type_counts

  const groupsQuery = useQuery({ ...channelGroupNamesQuery(), enabled: isAdmin && can.read })

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['channels'] })
  }, [queryClient])

  const statusMutation = useMutation({
    mutationFn: (input: { id: number; status: number }) => setChannelStatus(input.id, input.status),
    onSuccess: (changed, input) => {
      if (changed) {
        toast.success(
          input.status === CHANNEL_STATUS.enabled ? t('Channel enabled') : t('Channel disabled'),
        )
      } else {
        toast.info(t('The channel was already in that state.'))
      }
      refresh()
    },
    onError: (error: unknown) => toast.error(toErrorMessage(error)),
  })

  const copyMutation = useMutation({
    mutationFn: (id: number) => copyChannel(id, '_copy'),
    onSuccess: (created) => {
      toast.success(t('Copied to channel #{{id}}. The key was copied with it.', { id: created.id }))
      refresh()
    },
    onError: (error: unknown) => toast.error(toErrorMessage(error)),
  })

  /**
   * Returns the outcome rather than a bare boolean: the batch runner needs the
   * upstream's own message, and reading it back out of `outcomes` would see the state
   * as it stood when this callback was created, not the value just recorded.
   */
  const runTest = useCallback(
    async (channel: Channel): Promise<TestOutcome> => {
      setBusyRow({ id: channel.id, job: 'test' })
      try {
        const result = await testChannel(channel.id, channel.test_model ?? '')
        const outcome: TestOutcome = {
          errorCode: result.error_code,
          message: result.message,
          ok: result.success,
          seconds: result.time,
        }
        setOutcomes((previous) => ({ ...previous, [channel.id]: outcome }))
        if (result.success) {
          toast.success(t('“{{name}}” answered in {{seconds}}s', {
            name: channel.name,
            seconds: result.time.toFixed(2),
          }))
        } else {
          toast.error(t('“{{name}}” failed: {{message}}', {
            message: result.message,
            name: channel.name,
          }))
        }
        refresh()
        return outcome
      } catch (error: unknown) {
        const outcome: TestOutcome = { message: toErrorMessage(error), ok: false, seconds: 0 }
        setOutcomes((previous) => ({ ...previous, [channel.id]: outcome }))
        toast.error(outcome.message)
        return outcome
      } finally {
        setBusyRow(null)
      }
    },
    [refresh, t],
  )

  const runBalance = useCallback(
    async (channel: Channel) => {
      setBusyRow({ id: channel.id, job: 'balance' })
      try {
        const result = await refreshChannelBalance(channel.id)
        if (result.success) {
          toast.success(t('“{{name}}” reports {{balance}}', {
            balance: formatCurrency(result.balance ?? 0),
            name: channel.name,
          }))
          refresh()
        } else {
          toast.error(t('“{{name}}” failed: {{message}}', {
            message: result.message,
            name: channel.name,
          }))
        }
      } catch (error: unknown) {
        toast.error(toErrorMessage(error))
      } finally {
        setBusyRow(null)
      }
    },
    [refresh, t],
  )

  const rows = channels ?? []
  const selectedIds = Object.keys(selection)
    .filter((key) => selection[key])
    .map((key) => Number(key))
  const selectedChannels = rows.filter((channel) => selection[String(channel.id)] === true)

  const openCreate = useCallback(() => {
    setEditingId(undefined)
    setDrawerOpen(true)
  }, [])

  const openEdit = useCallback((channel: Channel) => {
    setEditingId(channel.id)
    setDrawerOpen(true)
  }, [])

  const runStatus = statusMutation.mutate
  const runCopy = copyMutation.mutate
  const busyRowId = busyRow?.id
  const busyRowJob = busyRow?.job

  const columns = useMemo<DataTableColumns<Channel>>(
    () => [
      {
        id: 'select',
        enableSorting: false,
        header: ({ table }) => (
          <Checkbox
            checked={selectAllState(table.getIsAllPageRowsSelected(), table.getIsSomePageRowsSelected())}
            hideLabel
            label={t('Select every channel on this page')}
            onCheckedChange={(checked) => table.toggleAllPageRowsSelected(checked)}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            hideLabel
            label={t('Select {{name}}', { name: row.original.name })}
            onCheckedChange={(checked) => row.toggleSelected(checked)}
          />
        ),
        meta: { hideOnMobile: true, label: t('Selection') },
      },
      {
        accessorKey: 'id',
        id: 'id',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('ID')} />,
        cell: ({ row }) => <MonoCell value={row.original.id} />,
        meta: { label: t('ID'), mono: true },
      },
      {
        accessorKey: 'name',
        id: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Channel')} />,
        cell: ({ row }) => {
          const channel = row.original
          const tag = channel.tag
          const remark = channel.remark
          return (
            <span className="flex min-w-0 flex-col gap-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="truncate font-semibold text-foreground">{channel.name}</span>
                {tag === null || tag === '' ? null : (
                  <Badge size="sm" tone="info">{tag}</Badge>
                )}
                {channel.channel_info.is_multi_key ? (
                  <Badge size="sm" tone="secondary">
                    {t('{{count}} keys', { count: channel.channel_info.multi_key_size })}
                  </Badge>
                ) : null}
              </span>
              {remark === null || remark === '' ? null : (
                <span className="truncate text-xs text-muted">{remark}</span>
              )}
            </span>
          )
        },
        meta: { label: t('Channel'), mobilePrimary: true },
      },
      {
        id: 'type',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Provider')} />,
        cell: ({ row }) => <BadgeCell label={channelTypeName(row.original.type)} tone="muted" />,
        meta: { label: t('Provider') },
      },
      {
        id: 'status',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Status')} />,
        cell: ({ row }) => {
          const channel = row.original
          const reason = channelStatusReason(channel)
          if (reason === undefined) {
            return (
              <StatusBadge tone={channelStatusTone(channel.status)}>
                {t(channelStatusLabel(channel.status))}
              </StatusBadge>
            )
          }
          return (
            <Tooltip content={reason}>
              <StatusBadge title={reason} tone={channelStatusTone(channel.status)}>
                {t(channelStatusLabel(channel.status))}
              </StatusBadge>
            </Tooltip>
          )
        },
        meta: { label: t('Status') },
      },
      {
        id: 'group',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Groups')} />,
        cell: ({ row }) => {
          const groups = splitList(row.original.group)
          if (groups.length === 0) return <MonoCell fallback={t('None')} value={null} />
          return (
            <span className="flex flex-wrap gap-1">
              {groups.map((group) => (
                <Badge className="mono" key={group} size="sm" tone="muted">{group}</Badge>
              ))}
            </span>
          )
        },
        meta: { label: t('Groups') },
      },
      {
        id: 'models',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Models')} />,
        cell: ({ row }) => {
          const models = splitList(row.original.models)
          if (models.length === 0) return <MonoCell fallback={t('None')} value={null} />
          return (
            <Tooltip content={models.join(', ')}>
              <Badge size="sm" title={models.join(', ')} tone="muted">
                {t('{{count}} models', { count: models.length })}
              </Badge>
            </Tooltip>
          )
        },
        meta: { label: t('Models') },
      },
      {
        accessorKey: 'priority',
        id: 'priority',
        header: ({ column }) => (
          <DataTableColumnHeader align="right" column={column} title={t('Priority')} />
        ),
        cell: ({ row }) => (
          <MonoCell align="right" value={formatNumber(row.original.priority ?? 0)} />
        ),
        meta: { align: 'right', label: t('Priority'), mono: true },
      },
      {
        id: 'weight',
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader align="right" column={column} title={t('Weight')} />
        ),
        cell: ({ row }) => <MonoCell align="right" value={formatNumber(row.original.weight ?? 0)} />,
        meta: { align: 'right', hideOnMobile: true, label: t('Weight'), mono: true },
      },
      {
        accessorKey: 'balance',
        id: 'balance',
        header: ({ column }) => (
          <DataTableColumnHeader align="right" column={column} title={t('Balance')} />
        ),
        cell: ({ row }) => {
          const channel = row.original
          if (!SUPPORTS_BALANCE_TYPES.has(channel.type)) {
            return <MonoCell align="right" fallback={t('Not supported')} value={null} />
          }
          if (channel.balance_updated_time === 0) {
            return <MonoCell align="right" fallback={t('Never checked')} value={null} />
          }
          return (
            <Tooltip content={t('Checked {{date}}', {
              date: formatDateTime(channel.balance_updated_time, locale),
            })}
            >
              <span className="mono block text-right text-foreground">
                {formatCurrency(channel.balance)}
              </span>
            </Tooltip>
          )
        },
        meta: { align: 'right', label: t('Balance'), mono: true },
      },
      {
        accessorKey: 'response_time',
        id: 'response_time',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Last test')} />,
        cell: ({ row }) => {
          const channel = row.original
          const outcome = outcomes[channel.id]
          if (outcome !== undefined && !outcome.ok) {
            return (
              <Tooltip content={outcome.message}>
                <StatusBadge title={outcome.message} tone="destructive">
                  {outcome.errorCode === undefined ? t('Failed') : outcome.errorCode}
                </StatusBadge>
              </Tooltip>
            )
          }
          if (channel.test_time === 0 && outcome === undefined) {
            return <MonoCell fallback={t('Never tested')} value={null} />
          }
          const milliseconds = outcome === undefined
            ? channel.response_time
            : Math.round(outcome.seconds * 1000)
          return (
            <Tooltip content={t('Tested {{date}}', {
              date: channel.test_time === 0
                ? t('just now')
                : formatDateTime(channel.test_time, locale),
            })}
            >
              <Badge className="mono" size="sm" tone={responseTimeTone(milliseconds)}>
                {t('{{ms}} ms', { ms: formatNumber(milliseconds) })}
              </Badge>
            </Tooltip>
          )
        },
        meta: { label: t('Last test') },
      },
      {
        id: 'actions',
        enableSorting: false,
        header: () => <span className="sr-only">{t('Actions')}</span>,
        cell: ({ row }) => {
          const channel = row.original
          const balanceSupported = SUPPORTS_BALANCE_TYPES.has(channel.type)
            && !channel.channel_info.is_multi_key
          const testing = busyRowId === channel.id && busyRowJob === 'test'
          const checking = busyRowId === channel.id && busyRowJob === 'balance'

          const actions: DataTableRowAction[] = [
            {
              disabled: !(can.write || can.sensitive_write),
              icon: <PencilIcon />,
              id: 'edit',
              label: can.write || can.sensitive_write
                ? t('Edit {{name}}', { name: channel.name })
                : t('Edit {{name}} — needs the channel:write grant', { name: channel.name }),
              onClick: () => openEdit(channel),
            },
            {
              busy: testing,
              disabled: !can.operate || busyRow !== null || batchRunning,
              icon: <PlugZapIcon />,
              id: 'test',
              label: can.operate
                ? t('Send a live test request to {{name}}', { name: channel.name })
                : t('Test {{name}} — needs the channel:operate grant', { name: channel.name }),
              onClick: () => void runTest(channel),
            },
            {
              busy: checking,
              disabled: !can.operate || !balanceSupported || busyRow !== null || batchRunning,
              icon: <CoinsIcon />,
              id: 'balance',
              label: balanceSupported
                ? t('Refresh the balance of {{name}}', { name: channel.name })
                : t('Balance queries are not implemented for {{provider}}', {
                  provider: channelTypeName(channel.type),
                }),
              onClick: () => void runBalance(channel),
            },
          ]

          const menuItems: DropdownMenuItem[] = [
            {
              disabled: !can.operate || channel.status === CHANNEL_STATUS.enabled,
              icon: <PowerIcon />,
              id: 'enable',
              label: t('Enable'),
              onSelect: () => runStatus({ id: channel.id, status: CHANNEL_STATUS.enabled }),
            },
            {
              disabled: !can.operate || channel.status === CHANNEL_STATUS.manuallyDisabled,
              icon: <PowerOffIcon />,
              id: 'disable',
              label: t('Disable'),
              onSelect: () => runStatus({ id: channel.id, status: CHANNEL_STATUS.manuallyDisabled }),
            },
            {
              disabled: !can.sensitive_write,
              hint: t('Key included'),
              icon: <CopyIcon />,
              id: 'copy',
              label: t('Duplicate'),
              separatorBefore: true,
              onSelect: () => runCopy(channel.id),
            },
            {
              destructive: true,
              disabled: !can.sensitive_write,
              icon: <Trash2Icon />,
              id: 'delete',
              label: t('Delete permanently'),
              separatorBefore: true,
              onSelect: () => setPending({ ids: [channel.id], kind: 'delete-one', name: channel.name }),
            },
          ]

          const menuLabel = t('More actions for {{name}}', { name: channel.name })

          return (
            <ActionsCell actions={actions} label={t('Actions for {{name}}', { name: channel.name })}>
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
    [
      batchRunning,
      busyRow,
      busyRowId,
      busyRowJob,
      can.operate,
      can.sensitive_write,
      can.write,
      locale,
      openEdit,
      outcomes,
      runBalance,
      runCopy,
      runStatus,
      runTest,
      t,
    ],
  )

  const { table, paginationControls } = useDataTable<Channel>({
    columns,
    data: channels,
    enableRowSelection: true,
    getRowId: (row) => String(row.id),
    onPageChange: (query) => {
      setPage(query.p)
      setPageSize(query.page_size)
    },
    onRowSelectionChange: setSelection,
    onSortingChange: (sorting) => {
      const [first] = sorting
      // `model.NewChannelSortOptions` silently falls back for anything outside its six
      // columns, so an unsupported id is dropped rather than sent.
      if (first === undefined || !isChannelSortColumn(first.id)) {
        setSortBy(undefined)
        setSortOrder(undefined)
        return
      }
      setSortBy(first.id)
      setSortOrder(first.desc ? 'desc' : 'asc')
    },
    page,
    pageSize,
    rowSelection: selection,
    total,
  })

  const updateFilters = (next: Partial<ChannelFilters>) => {
    setFilters((previous) => ({ ...previous, ...next }))
    setPage(1)
  }

  const clearSelection = () => {
    table.resetRowSelection()
  }

  /**
   * Batch status and delete are single server round trips that report a count. A batch
   * TEST is not: there is no inline "test everything" endpoint (`GET /api/channel/test`
   * enqueues a background system task instead), so the tests are run one at a time and
   * every failure is collected rather than swallowed.
   */
  const runBatch = async (batch: PendingBatch) => {
    setBatchRunning(true)
    try {
      if (batch.kind === 'delete' || batch.kind === 'delete-one') {
        if (batch.kind === 'delete-one') {
          await deleteChannel(batch.ids[0])
          toast.success(t('Channel deleted'))
        } else {
          const deleted = await deleteChannelsBatch(batch.ids)
          setReport({
            failed: batch.ids.length - deleted,
            failures: [],
            succeeded: deleted,
            title: t('Deleted {{deleted}} of {{total}} selected channels', {
              deleted,
              total: batch.ids.length,
            }),
          })
        }
        clearSelection()
        refresh()
        return
      }

      if (batch.kind === 'enable' || batch.kind === 'disable') {
        const status = batch.kind === 'enable'
          ? CHANNEL_STATUS.enabled
          : CHANNEL_STATUS.manuallyDisabled
        const changed = await setChannelStatusBatch(batch.ids, status)
        setReport({
          failed: batch.ids.length - changed,
          failures: changed === batch.ids.length
            ? []
            : [t('The rest were already in that state, or no longer exist.')],
          succeeded: changed,
          title: batch.kind === 'enable'
            ? t('Enabled {{changed}} of {{total}} selected channels', {
              changed,
              total: batch.ids.length,
            })
            : t('Disabled {{changed}} of {{total}} selected channels', {
              changed,
              total: batch.ids.length,
            }),
        })
        clearSelection()
        refresh()
        return
      }

      const failures: string[] = []
      let succeeded = 0
      for (const channel of selectedChannels) {
        const outcome = await runTest(channel)
        if (outcome.ok) succeeded += 1
        else failures.push(`${channel.name}: ${outcome.message === '' ? t('Failed') : outcome.message}`)
      }
      setReport({
        failed: selectedChannels.length - succeeded,
        failures,
        succeeded,
        title: t('{{succeeded}} of {{total}} selected channels answered', {
          succeeded,
          total: selectedChannels.length,
        }),
      })
    } catch (error: unknown) {
      toast.error(toErrorMessage(error))
    } finally {
      setBatchRunning(false)
      setPending(null)
    }
  }

  const statusOptions: NativeSelectOption[] = [
    { label: t('Any status'), value: '' },
    { label: t('Enabled'), value: 'enabled' },
    { label: t('Disabled'), value: 'disabled' },
  ]

  const typeOptions: NativeSelectOption[] = [
    { label: t('Any provider'), value: '' },
    ...channelTypeOptions()
      .filter((option) => typeCounts === undefined || typeCounts[String(option.value)] !== undefined)
      .map((option) => ({
        label: typeCounts === undefined
          ? option.label
          : `${option.label} (${typeCounts[String(option.value)] ?? 0})`,
        value: String(option.value),
      })),
  ]

  const groupOptions: NativeSelectOption[] = [
    { label: t('Any group'), value: '' },
    ...(groupsQuery.data ?? []).map((group) => ({ label: group, value: group })),
  ]

  const filtered = hasActiveChannelFilters(filters)
  const emptyTitle = filtered ? t('No matching channels') : t('No channels yet')
  const emptyDescription = filtered
    ? t('No channel matches this search and these facets.')
    : t('A channel is one upstream provider credential plus the routing rules around it. Nothing can be relayed until at least one exists.')

  const pageTitle = t('Channels')
  const pageDescription = t('Upstream provider credentials, the models each one serves and the routing that picks between them.')

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
          {t('Every channel endpoint sits behind the administrator guard, so this page has nothing to show for your account.')}
        </Alert>
      </div>
    )
  }

  if (!can.read) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader description={pageDescription} title={pageTitle} />
        <Alert
          icon={<ShieldAlertIcon aria-hidden="true" />}
          title={t('The channel:read grant is missing')}
          tone="warning"
        >
          {t('Your administrator account does not hold the channel read permission, so the list cannot be requested.')}
        </Alert>
      </div>
    )
  }

  const confirmCopy = ((): { title: string; description: string; confirm: string } => {
    if (pending === null) return { confirm: '', description: '', title: '' }
    const count = pending.ids.length
    if (pending.kind === 'delete-one') {
      return {
        confirm: t('Delete channel'),
        description: t('“{{name}}” is removed from the database along with its stored key and its routing entries. This cannot be undone.', { name: pending.name }),
        title: t('Delete this channel permanently?'),
      }
    }
    if (pending.kind === 'delete') {
      return {
        confirm: t('Delete {{count}} channels', { count }),
        description: t('{{count}} channels are removed from the database along with their stored keys and routing entries. This cannot be undone.', { count }),
        title: t('Delete {{count}} channels permanently?', { count }),
      }
    }
    if (pending.kind === 'disable') {
      return {
        confirm: t('Disable {{count}} channels', { count }),
        description: t('{{count}} channels stop serving traffic immediately. Requests fall through to whatever else can serve the model.', { count }),
        title: t('Disable {{count}} channels?', { count }),
      }
    }
    if (pending.kind === 'enable') {
      return {
        confirm: t('Enable {{count}} channels', { count }),
        description: t('{{count}} channels start serving traffic again, including any the gateway disabled by itself.', { count }),
        title: t('Enable {{count}} channels?', { count }),
      }
    }
    return {
      confirm: t('Test {{count}} channels', { count }),
      description: t('Each of the {{count}} selected channels is sent one real request, one after another. This spends upstream credit and can take a while.', { count }),
      title: t('Send a live request to {{count}} channels?', { count }),
    }
  })()

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        action={
          <Button
            disabled={!can.sensitive_write}
            onClick={openCreate}
            title={can.sensitive_write ? undefined : t('Creating a channel needs the channel:sensitive_write grant.')}
            variant="primary"
          >
            <PlusIcon aria-hidden="true" />
            {t('New channel')}
          </Button>
        }
        description={pageDescription}
        title={pageTitle}
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
                hideLabel
                label={t('Provider')}
                onChange={(event) => updateFilters({ type: event.target.value })}
                options={typeOptions}
                size="sm"
                value={filters.type}
              />
              <NativeSelect
                className="w-40"
                disabled={groupsQuery.data === undefined}
                hideLabel
                label={t('Group')}
                onChange={(event) => updateFilters({ group: event.target.value })}
                options={groupOptions}
                size="sm"
                value={filters.group}
              />
              <Input
                className="w-52"
                hideLabel
                inputClassName="mono"
                label={t('Model')}
                onChange={(event) => updateFilters({ model: event.target.value })}
                placeholder={t('Serves this model')}
                size="sm"
                value={filters.model}
              />
            </>
          }
          filtersLabel={t('Channel facets')}
          isResetDisabled={!filtered}
          label={t('Channel filters')}
          onReset={() => {
            setFilters(EMPTY_CHANNEL_FILTERS)
            setPage(1)
          }}
          search={
            <SearchInput
              debounceMs={300}
              description={t('Matches an exact id, or part of a name, key prefix or base URL.')}
              hideLabel
              label={t('Search channels')}
              onValueChange={(next) => updateFilters({ keyword: next })}
              placeholder={t('Name, id or base URL')}
              size="sm"
              value={filters.keyword}
            />
          }
        />

        {selectedIds.length === 0 ? null : (
          <div
            aria-label={t('Bulk channel actions')}
            className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-high px-4 py-3"
            role="group"
          >
            <span className="text-sm font-semibold text-foreground">
              {t('{{count}} selected', { count: selectedIds.length })}
            </span>
            <Button
              disabled={!can.operate || batchRunning}
              onClick={() => setPending({ ids: selectedIds, kind: 'enable' })}
              size="sm"
              variant="outline"
            >
              <PowerIcon aria-hidden="true" />
              {t('Enable')}
            </Button>
            <Button
              disabled={!can.operate || batchRunning}
              onClick={() => setPending({ ids: selectedIds, kind: 'disable' })}
              size="sm"
              variant="outline"
            >
              <PowerOffIcon aria-hidden="true" />
              {t('Disable')}
            </Button>
            <Button
              disabled={!can.operate || batchRunning}
              onClick={() => setPending({ ids: selectedIds, kind: 'test' })}
              size="sm"
              variant="outline"
            >
              <PlugZapIcon aria-hidden="true" />
              {t('Test')}
            </Button>
            <Button
              disabled={!can.sensitive_write || batchRunning}
              onClick={() => setPending({ ids: selectedIds, kind: 'delete' })}
              size="sm"
              variant="danger"
            >
              <Trash2Icon aria-hidden="true" />
              {t('Delete')}
            </Button>
            <Button disabled={batchRunning} onClick={clearSelection} size="sm" variant="quiet">
              {t('Clear selection')}
            </Button>
          </div>
        )}

        {report === null ? null : (
          <div className="border-b border-border p-4">
            <Alert
              dismissLabel={t('Dismiss this summary')}
              dismissible
              live="status"
              onDismiss={() => setReport(null)}
              title={report.title}
              tone={report.failed === 0 ? 'success' : 'warning'}
            >
              {report.failures.length === 0 ? null : (
                <ul className="mt-1 flex list-disc flex-col gap-1 pl-4">
                  {report.failures.map((failure) => (
                    <li className="text-xs leading-5" key={failure}>{failure}</li>
                  ))}
                </ul>
              )}
            </Alert>
          </div>
        )}

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
              title={t('Could not load the channels')}
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
                filtered || !can.sensitive_write ? undefined : (
                  <Button onClick={openCreate} variant="outline">
                    {t('New channel')}
                  </Button>
                )
              }
              emptyDescription={emptyDescription}
              emptyIcon={<ActivityIcon aria-hidden="true" className="mx-auto size-7 text-muted" />}
              emptyTitle={emptyTitle}
              isFetching={listQuery.isFetching}
              isLoading={listQuery.isLoading}
              label={t('Channels')}
              loadingLabel={t('Loading channels')}
              minWidthClassName="min-w-[92rem]"
              table={table}
            />

            <div className="p-4 md:hidden">
              <MobileCardList
                emptyDescription={emptyDescription}
                emptyIcon={<ActivityIcon aria-hidden="true" className="mx-auto size-7 text-muted" />}
                emptyTitle={emptyTitle}
                isFetching={listQuery.isFetching}
                isLoading={listQuery.isLoading}
                label={t('Channel cards')}
                loadingLabel={t('Loading channels')}
                table={table}
              />
            </div>

            <DataTablePagination
              {...paginationControls}
              isFetching={listQuery.isFetching}
              label={t('Channel pages')}
            />
          </>
        )}
      </Panel>

      <p className="text-xs leading-5 text-muted">
        {t('Testing a channel and refreshing its balance are real calls to the provider: they spend upstream credit and take as long as the provider takes. Balance queries are implemented for a handful of providers only; every other type answers "not implemented". A stored key is never returned by the server, so the editor cannot show it and leaving the key blank keeps it.')}
      </p>

      <ChannelDrawer
        canOperate={can.operate}
        canWrite={can.write}
        canWriteSensitive={can.sensitive_write}
        channelId={editingId}
        onChanged={refresh}
        onOpenChange={(open) => {
          setDrawerOpen(open)
          if (!open) setEditingId(undefined)
        }}
        open={drawerOpen}
      />

      <ConfirmDialog
        cancelLabel={t('Cancel')}
        confirmLabel={confirmCopy.confirm}
        confirmPhrase={pending?.kind === 'delete-one' ? pending.name : undefined}
        description={pending === null ? undefined : confirmCopy.description}
        destructive={pending?.kind === 'delete' || pending?.kind === 'delete-one'}
        isLoading={batchRunning}
        onConfirm={() => {
          if (pending !== null) void runBatch(pending)
        }}
        onOpenChange={(open) => {
          if (!open && !batchRunning) setPending(null)
        }}
        open={pending !== null}
        title={confirmCopy.title}
      />
    </div>
  )
}
