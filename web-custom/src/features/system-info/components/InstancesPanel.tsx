import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import CrownIcon from 'lucide-react/dist/esm/icons/crown'
import ServerIcon from 'lucide-react/dist/esm/icons/server'
import Trash2Icon from 'lucide-react/dist/esm/icons/trash-2'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  ActionsCell,
  DataTable,
  DataTableColumnHeader,
  MobileCardList,
  MonoCell,
  useDataTable,
  type DataTableColumns,
} from '@/components/data'
import { ConfirmDialog, Tooltip, toErrorMessage, toast } from '@/components/overlay'
import {
  Alert,
  Badge,
  Button,
  Panel,
  ProgressBar,
  StatusBadge,
} from '@/components/ui'
import {
  deleteInstance,
  deleteStaleInstances,
  INSTANCE_HEARTBEAT_INTERVAL_MS,
  systemInstancesQuery,
  type SystemInstance,
} from '@/features/system-info/api'
import { PollStatus } from '@/features/system-info/components/PollStatus'
import {
  countInstances,
  formatBytes,
  formatDuration,
  heartbeatAgeSeconds,
  instanceHostname,
  instanceNodeName,
  instancePlatform,
  instanceVersion,
  isAutoNamedInstance,
  isMasterInstance,
  RESOURCE_CRITICAL_PERCENT,
  RESOURCE_WARNING_PERCENT,
  resourceTone,
  uptimeSeconds,
} from '@/features/system-info/presentation'
import { pollingInterval, usePageVisible } from '@/features/system-info/use-page-visible'
import { formatDateTime, formatPercent } from '@/lib/format'

/**
 * Matched to `service.systemInstanceReportInterval` (30s): every node upserts its row
 * on that cadence, so a faster poll would only re-read the same values.
 */
export const INSTANCE_POLL_INTERVAL_MS = INSTANCE_HEARTBEAT_INTERVAL_MS

/** Read at render time so a node that lapses while the page is open ages visibly. */
function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

type ResourceMeterProps = {
  label: string
  percent: number | undefined
  detail?: string
}

function ResourceMeter(props: ResourceMeterProps) {
  const hasValue = typeof props.percent === 'number' && Number.isFinite(props.percent)
  const clamped = hasValue ? Math.min(100, Math.max(0, props.percent as number)) : 0

  return (
    <div className="flex min-w-[7rem] flex-col gap-1.5">
      <span className="mono text-xs text-foreground">
        {hasValue ? formatPercent(props.percent as number) : '—'}
      </span>
      <ProgressBar
        label={props.label}
        size="xs"
        tone={resourceTone(props.percent)}
        value={clamped}
        valueText={hasValue ? formatPercent(props.percent as number) : undefined}
      />
      {props.detail ? <span className="mono text-[0.6875rem] text-muted">{props.detail}</span> : null}
    </div>
  )
}

export function InstancesPanel() {
  const { i18n, t } = useTranslation()
  const locale = i18n.language
  const queryClient = useQueryClient()
  const isVisible = usePageVisible()

  const [pendingNode, setPendingNode] = useState<SystemInstance | null>(null)
  const [pruneOpen, setPruneOpen] = useState(false)

  const instancesQuery = useQuery({
    ...systemInstancesQuery(),
    refetchInterval: pollingInterval(INSTANCE_POLL_INTERVAL_MS, isVisible),
  })

  const instances = useMemo(() => instancesQuery.data ?? [], [instancesQuery.data])
  const counts = countInstances(instances)
  const staleAfterSeconds = instances[0]?.stale_after_seconds

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['system-info', 'instances'] })
  }

  const deleteNodeMutation = useMutation({
    mutationFn: (nodeName: string) => deleteInstance(nodeName),
    onError: (error: unknown) => toast.error(toErrorMessage(error)),
    onSuccess: (_result, nodeName) => {
      toast.success(t('Removed instance {{node}}', { node: nodeName }))
      setPendingNode(null)
      refresh()
    },
  })

  const pruneMutation = useMutation({
    mutationFn: deleteStaleInstances,
    onError: (error: unknown) => toast.error(toErrorMessage(error)),
    onSuccess: (result) => {
      toast.success(t('Removed {{count}} stale instances', { count: result.deleted_count }))
      setPruneOpen(false)
      refresh()
    },
  })

  const pendingDeleteNode = deleteNodeMutation.isPending ? deleteNodeMutation.variables : undefined

  const columns = useMemo<DataTableColumns<SystemInstance>>(
    () => [
      {
        cell: ({ row }) => {
          const instance = row.original
          const hostname = instanceHostname(instance)
          const name = instanceNodeName(instance)
          return (
            <div className="flex min-w-0 flex-col gap-1">
              <span className="mono truncate font-semibold text-foreground" title={name}>
                {name}
              </span>
              {hostname && hostname !== name ? (
                <span className="mono truncate text-xs text-muted" title={hostname}>
                  {hostname}
                </span>
              ) : null}
              {isAutoNamedInstance(instance) ? (
                <Tooltip
                  content={t('NODE_NAME is not set on this node, so its name falls back to the hostname. A host whose name changes between restarts leaves an orphaned row behind each time.')}
                >
                  <Badge size="sm" tone="warning">
                    {t('Auto-named')}
                  </Badge>
                </Tooltip>
              ) : null}
            </div>
          )
        },
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Node')} />,
        id: 'node',
        meta: { label: t('Node'), mobilePrimary: true },
      },
      {
        cell: ({ row }) => {
          const instance = row.original
          const online = instance.status === 'online'
          return (
            <div className="flex flex-col items-start gap-1">
              <StatusBadge pulse={online} tone={online ? 'success' : 'warning'}>
                {online ? t('Online') : t('Stale')}
              </StatusBadge>
              <span className="mono text-xs text-muted">
                {t('{{duration}} ago', {
                  duration: formatDuration(heartbeatAgeSeconds(instance, nowSeconds())),
                })}
              </span>
            </div>
          )
        },
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Heartbeat')} />,
        id: 'status',
        meta: { label: t('Heartbeat') },
      },
      {
        cell: ({ row }) => {
          const master = isMasterInstance(row.original)
          return (
            <Badge size="sm" tone={master ? 'info' : 'muted'}>
              {master ? <CrownIcon aria-hidden="true" className="size-3" /> : null}
              {master ? t('Master') : t('Worker')}
            </Badge>
          )
        },
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Role')} />,
        id: 'role',
        meta: { label: t('Role') },
      },
      {
        cell: ({ row }) => (
          <ResourceMeter
            label={t('CPU usage on {{node}}', { node: instanceNodeName(row.original) })}
            percent={row.original.info?.resources?.cpu?.usage_percent}
          />
        ),
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('CPU')} />,
        id: 'cpu',
        meta: { label: t('CPU') },
      },
      {
        cell: ({ row }) => (
          <ResourceMeter
            label={t('Memory usage on {{node}}', { node: instanceNodeName(row.original) })}
            percent={row.original.info?.resources?.memory?.usage_percent}
          />
        ),
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Memory')} />,
        id: 'memory',
        meta: { label: t('Memory') },
      },
      {
        cell: ({ row }) => {
          const storage = row.original.info?.resources?.storage
          const detail = storage?.used_bytes !== undefined && storage.total_bytes !== undefined
            ? t('{{used}} of {{total}}', {
              total: formatBytes(storage.total_bytes),
              used: formatBytes(storage.used_bytes),
            })
            : undefined
          return (
            <ResourceMeter
              detail={detail}
              label={t('Storage usage on {{node}}', { node: instanceNodeName(row.original) })}
              percent={storage?.used_percent}
            />
          )
        },
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Storage')} />,
        id: 'storage',
        meta: { label: t('Storage') },
      },
      {
        cell: ({ row }) => (
          <div className="flex flex-col gap-1">
            <MonoCell value={instanceVersion(row.original)} />
            <span className="mono text-xs text-muted">{instancePlatform(row.original) ?? '—'}</span>
          </div>
        ),
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Build')} />,
        id: 'build',
        meta: { label: t('Build'), mono: true },
      },
      {
        cell: ({ row }) => (
          <div className="flex flex-col gap-1">
            <MonoCell value={formatDuration(uptimeSeconds(row.original, nowSeconds()))} />
            <span className="mono text-xs text-muted">
              {formatDateTime(row.original.started_at, locale)}
            </span>
          </div>
        ),
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Uptime')} />,
        id: 'uptime',
        meta: { label: t('Uptime'), mono: true },
      },
      {
        cell: ({ row }) => {
          const instance = row.original
          const name = instanceNodeName(instance)
          const online = instance.status === 'online'
          return (
            <ActionsCell
              actions={[
                {
                  busy: pendingDeleteNode === instance.node_name,
                  // The server's WHERE clause carries the staleness predicate, so an
                  // online node is refused outright — the control says so instead of
                  // sending a call that cannot succeed.
                  disabled: online,
                  icon: <Trash2Icon />,
                  id: 'delete',
                  label: online
                    ? t('{{node}} is online and cannot be removed', { node: name })
                    : t('Remove stale instance {{node}}', { node: name }),
                  onClick: () => setPendingNode(instance),
                  tone: 'danger',
                },
              ]}
              label={t('Actions for {{node}}', { node: name })}
            />
          )
        },
        enableSorting: false,
        header: () => <span className="sr-only">{t('Actions')}</span>,
        id: 'actions',
        meta: { align: 'right', label: t('Actions') },
      },
    ],
    [locale, pendingDeleteNode, t],
  )

  const { table } = useDataTable<SystemInstance>({
    columns,
    data: instancesQuery.data,
    getRowId: (row) => row.node_name,
  })

  const emptyTitle = t('No node has reported a heartbeat')
  const emptyDescription = t('Each running node upserts a row every 30 seconds. An empty list means no process is reporting — or that every row was pruned since the last restart.')

  return (
    <Panel aria-labelledby="system-instances-heading" className="overflow-hidden">
      <Panel.Header
        actions={
          <div className="flex items-center gap-3">
            <PollStatus
              dataUpdatedAt={instancesQuery.dataUpdatedAt}
              intervalMs={INSTANCE_POLL_INTERVAL_MS}
              isFetching={instancesQuery.isFetching}
              isVisible={isVisible}
              onRefresh={refresh}
              refreshLabel={t('Refresh instances now')}
            />
            <Button
              disabled={counts.stale === 0}
              onClick={() => setPruneOpen(true)}
              size="sm"
              variant="danger"
            >
              <Trash2Icon aria-hidden="true" />
              {t('Prune stale')}
            </Button>
          </div>
        }
        icon={<ServerIcon aria-hidden="true" className="size-5 text-primary" />}
        title={t('Instances')}
        titleId="system-instances-heading"
      />

      <Panel.Body className="flex flex-wrap items-center gap-2 border-b border-border">
        <Badge tone="muted">{t('{{count}} nodes', { count: counts.total })}</Badge>
        <Badge tone={counts.online > 0 ? 'success' : 'muted'}>
          {t('{{count}} online', { count: counts.online })}
        </Badge>
        <Badge tone={counts.stale > 0 ? 'warning' : 'muted'}>
          {t('{{count}} stale', { count: counts.stale })}
        </Badge>
        <Badge tone="info">{t('{{count}} master', { count: counts.master })}</Badge>
        <span className="text-xs text-muted">
          {t('Counted from this list; the server reports no totals of its own.')}
        </span>
      </Panel.Body>

      {instancesQuery.isSuccess && counts.total > 0 && counts.master !== 1 ? (
        <div className="border-b border-border p-5">
          <Alert
            icon={<TriangleAlertIcon aria-hidden="true" />}
            title={
              counts.master === 0
                ? t('No node holds the master role')
                : t('More than one node holds the master role')
            }
            tone="warning"
          >
            {counts.master === 0
              ? t('The master role comes from NODE_TYPE, not from an election. With no master, master-only background work — session cleanup, subscription resets and scheduled system tasks — runs nowhere.')
              : t('The master role comes from NODE_TYPE, not from an election, so master-only background work — session cleanup, subscription resets and scheduled system tasks — runs on every one of these nodes at once.')}
          </Alert>
        </div>
      ) : null}

      {instancesQuery.isError ? (
        <div className="p-5">
          <Alert
            action={
              <Button
                aria-busy={instancesQuery.isFetching}
                disabled={instancesQuery.isFetching}
                onClick={() => void instancesQuery.refetch()}
                variant="outline"
              >
                {t('Try again')}
              </Button>
            }
            icon={<TriangleAlertIcon aria-hidden="true" />}
            title={t('Could not load instances')}
            tone="destructive"
          >
            {toErrorMessage(instancesQuery.error)}
          </Alert>
        </div>
      ) : (
        <>
          <DataTable
            className="hidden lg:block"
            emptyDescription={emptyDescription}
            emptyIcon={<ServerIcon aria-hidden="true" className="mx-auto size-7 text-muted" />}
            emptyTitle={emptyTitle}
            isFetching={instancesQuery.isFetching}
            isLoading={instancesQuery.isLoading}
            label={t('Deployment instances')}
            loadingLabel={t('Loading instances')}
            minWidthClassName="min-w-[80rem]"
            table={table}
          />

          <div className="p-4 lg:hidden">
            <MobileCardList
              emptyDescription={emptyDescription}
              emptyIcon={<ServerIcon aria-hidden="true" className="mx-auto size-7 text-muted" />}
              emptyTitle={emptyTitle}
              isFetching={instancesQuery.isFetching}
              isLoading={instancesQuery.isLoading}
              label={t('Deployment instance cards')}
              loadingLabel={t('Loading instances')}
              table={table}
            />
          </div>
        </>
      )}

      <Panel.Footer align="start">
        <p className="text-xs leading-5 text-muted">
          {t('Uptime is now − started_at and heartbeat age is now − last_seen_at, both measured against this browser clock. The server owns the online/stale verdict: a node is stale once its heartbeat is older than stale_after_seconds ({{seconds}}s).', {
            seconds: staleAfterSeconds ?? 90,
          })}
          {' '}
          {t('Meter colour is a console convention, not a server signal: warning at RESOURCE_WARNING_PERCENT ({{warning}}%), critical at RESOURCE_CRITICAL_PERCENT ({{critical}}%).', {
            critical: RESOURCE_CRITICAL_PERCENT,
            warning: RESOURCE_WARNING_PERCENT,
          })}
        </p>
      </Panel.Footer>

      <ConfirmDialog
        cancelLabel={t('Cancel')}
        confirmLabel={t('Remove instance')}
        description={
          pendingNode === null
            ? undefined
            : t('The heartbeat row for “{{node}}” is deleted. If that process is still alive it reappears within 30 seconds; if it is gone, the row goes for good.', {
              node: instanceNodeName(pendingNode),
            })
        }
        destructive
        isLoading={deleteNodeMutation.isPending}
        onConfirm={() => {
          if (pendingNode !== null) deleteNodeMutation.mutate(pendingNode.node_name)
        }}
        onOpenChange={(open) => {
          if (!open) setPendingNode(null)
        }}
        open={pendingNode !== null}
        title={t('Remove this stale instance?')}
      />

      <ConfirmDialog
        cancelLabel={t('Cancel')}
        confirmLabel={t('Prune stale instances')}
        description={t('Every heartbeat row older than stale_after_seconds is deleted across the whole deployment. Online nodes are untouched, and any node still running re-registers on its next heartbeat.')}
        destructive
        isLoading={pruneMutation.isPending}
        onConfirm={() => pruneMutation.mutate()}
        onOpenChange={setPruneOpen}
        open={pruneOpen}
        title={t('Prune every stale instance?')}
      >
        <Alert icon={<TriangleAlertIcon aria-hidden="true" />} tone="warning">
          {t('{{count}} rows currently read as stale.', { count: counts.stale })}
        </Alert>
      </ConfirmDialog>
    </Panel>
  )
}
