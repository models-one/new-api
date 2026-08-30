import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import ActivityIcon from 'lucide-react/dist/esm/icons/activity'
import CpuIcon from 'lucide-react/dist/esm/icons/cpu'
import HardDriveIcon from 'lucide-react/dist/esm/icons/hard-drive'
import InfoIcon from 'lucide-react/dist/esm/icons/info'
import RecycleIcon from 'lucide-react/dist/esm/icons/recycle'
import TrashIcon from 'lucide-react/dist/esm/icons/trash'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog, toErrorMessage, toast } from '@/components/overlay'
import {
  Alert,
  Button,
  DescriptionList,
  Panel,
  Skeleton,
  StatCard,
  type DescriptionListItem,
} from '@/components/ui'
import {
  clearDiskCache,
  forceGarbageCollection,
  performanceStatsQuery,
  PERFORMANCE_POLL_INTERVAL_MS,
  resetPerformanceStats,
} from '@/features/system-info/api'
import { PollStatus } from '@/features/system-info/components/PollStatus'
import {
  diskCacheUsagePercent,
  formatBytes,
  resourceTone,
} from '@/features/system-info/presentation'
import { pollingInterval, usePageVisible } from '@/features/system-info/use-page-visible'
import { formatNumber, formatPercent } from '@/lib/format'

/** The three controls this panel can fire, each behind its own confirmation. */
type MaintenanceAction = 'gc' | 'reset-stats' | 'clear-disk-cache'

const SKELETON_TILES = ['heap', 'goroutines', 'gc', 'disk'] as const

export function PerformancePanel() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const isVisible = usePageVisible()

  const [pendingAction, setPendingAction] = useState<MaintenanceAction | null>(null)

  const statsQuery = useQuery({
    ...performanceStatsQuery(),
    refetchInterval: pollingInterval(PERFORMANCE_POLL_INTERVAL_MS, isVisible),
  })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['performance', 'stats'] })
  }

  const maintenance = useMutation({
    mutationFn: (action: MaintenanceAction) => {
      if (action === 'gc') return forceGarbageCollection()
      if (action === 'reset-stats') return resetPerformanceStats()
      return clearDiskCache()
    },
    onError: (error: unknown) => toast.error(toErrorMessage(error)),
    onSuccess: (_result, action) => {
      const done: Record<MaintenanceAction, string> = {
        'clear-disk-cache': t('Inactive body cache files cleared'),
        gc: t('Garbage collection ran on the responding node'),
        'reset-stats': t('Body cache counters reset'),
      }
      toast.success(done[action])
      setPendingAction(null)
      refresh()
    },
  })

  const stats = statsQuery.data
  const cache = stats?.cache_stats
  const config = stats?.config
  const memory = stats?.memory_stats
  const disk = stats?.disk_space_info
  const cacheDir = stats?.disk_cache_info

  const cacheUsagePercent = cache
    ? diskCacheUsagePercent(cache.current_disk_usage_bytes, cache.disk_cache_max_bytes)
    : null

  const cacheItems: DescriptionListItem[] = cache && cacheDir
    ? [
      {
        description: cacheDir.path === ''
          ? t('Not reported')
          : <span className="mono break-all">{cacheDir.path}</span>,
        term: t('Cache directory'),
      },
      {
        description: cacheDir.exists ? t('Present') : t('Not created yet'),
        term: t('Directory state'),
      },
      {
        description: (
          <span className="mono">
            {t('{{count}} files · {{size}}', {
              count: cacheDir.file_count,
              size: formatBytes(cacheDir.total_size),
            })}
          </span>
        ),
        term: t('Files on disk'),
      },
      {
        description: (
          <span className="mono">
            {t('{{used}} of {{max}}', {
              max: formatBytes(cache.disk_cache_max_bytes),
              used: formatBytes(cache.current_disk_usage_bytes),
            })}
            {cacheUsagePercent === null ? '' : ` · ${formatPercent(cacheUsagePercent)}`}
          </span>
        ),
        term: t('Disk bytes held'),
      },
      {
        description: <span className="mono">{formatNumber(cache.active_disk_files)}</span>,
        term: t('Active disk files'),
      },
      {
        description: (
          <span className="mono">
            {t('{{count}} buffers · {{size}}', {
              count: cache.active_memory_buffers,
              size: formatBytes(cache.current_memory_usage_bytes),
            })}
          </span>
        ),
        term: t('In-memory buffers'),
      },
      {
        description: (
          <span className="mono">
            {t('{{memory}} memory · {{disk}} disk', {
              disk: formatNumber(cache.disk_cache_hits),
              memory: formatNumber(cache.memory_cache_hits),
            })}
          </span>
        ),
        term: t('Cache hits'),
      },
      {
        description: <span className="mono">{formatBytes(cache.disk_cache_threshold_bytes)}</span>,
        term: t('Spill-to-disk threshold'),
      },
    ]
    : []

  const configItems: DescriptionListItem[] = config
    ? [
      {
        description: config.disk_cache_enabled ? t('Enabled') : t('Disabled'),
        term: t('Body disk cache'),
      },
      {
        description: config.disk_cache_path === ''
          ? t('Not set — the runtime default is used')
          : <span className="mono break-all">{config.disk_cache_path}</span>,
        term: t('Configured path'),
      },
      {
        description: (
          <span className="mono">
            {t('{{threshold}} MB spill · {{max}} MB cap', {
              max: formatNumber(config.disk_cache_max_size_mb),
              threshold: formatNumber(config.disk_cache_threshold_mb),
            })}
          </span>
        ),
        term: t('Cache limits'),
      },
      {
        description: config.is_running_in_container ? t('Yes') : t('No'),
        term: t('Running in a container'),
      },
      {
        description: config.monitor_enabled ? t('Enabled') : t('Disabled'),
        term: t('Resource monitor'),
      },
      {
        description: (
          <span className="mono">
            {t('CPU {{cpu}}% · memory {{memory}}% · disk {{disk}}%', {
              cpu: config.monitor_cpu_threshold,
              disk: config.monitor_disk_threshold,
              memory: config.monitor_memory_threshold,
            })}
          </span>
        ),
        term: t('Monitor alert thresholds'),
      },
    ]
    : []

  const storageItems: DescriptionListItem[] = disk
    ? [
      { description: <span className="mono">{formatBytes(disk.total)}</span>, term: t('Total') },
      { description: <span className="mono">{formatBytes(disk.used)}</span>, term: t('Used') },
      { description: <span className="mono">{formatBytes(disk.free)}</span>, term: t('Free') },
      {
        description: <span className="mono">{formatPercent(disk.used_percent)}</span>,
        term: t('Used share'),
      },
    ]
    : []

  const confirmCopy: Record<MaintenanceAction, {
    title: string
    description: string
    confirmLabel: string
    destructive: boolean
    warning?: string
  }> = {
    gc: {
      confirmLabel: t('Run garbage collection'),
      description: t('Calls runtime.GC() on the process that answers this request. Go stops the world for the mark phase, so in-flight requests on that node pause for the duration.'),
      destructive: false,
      title: t('Force garbage collection now?'),
      warning: t('In a multi-node deployment only the node your load balancer picks is affected, and you cannot choose which one.'),
    },
    'reset-stats': {
      confirmLabel: t('Reset counters'),
      description: t('Zeroes the body cache counters — hits, active files and byte totals — on the responding node. Cached files themselves are left alone, but the history behind these numbers is gone.'),
      destructive: true,
      title: t('Reset the body cache counters?'),
    },
    'clear-disk-cache': {
      confirmLabel: t('Clear inactive files'),
      description: t('Deletes body cache files that have not been touched for ten minutes on the responding node. The ten-minute floor is the server\'s, so a request still streaming keeps its buffer.'),
      destructive: true,
      title: t('Clear the inactive body cache?'),
    },
  }

  const activeCopy = pendingAction === null ? null : confirmCopy[pendingAction]

  let body: ReactNode
  if (statsQuery.isError) {
    body = (
      <div className="px-5 pb-5">
        <Alert
          action={
            <Button
              aria-busy={statsQuery.isFetching}
              disabled={statsQuery.isFetching}
              onClick={() => void statsQuery.refetch()}
              variant="outline"
            >
              {t('Try again')}
            </Button>
          }
          icon={<TriangleAlertIcon aria-hidden="true" />}
          title={t('Could not load runtime statistics')}
          tone="destructive"
        >
          {toErrorMessage(statsQuery.error)}
        </Alert>
      </div>
    )
  } else if (statsQuery.isLoading || !stats || !memory || !disk) {
    body = (
      <div
        aria-busy="true"
        className="grid grid-cols-1 gap-4 px-5 pb-5 sm:grid-cols-2 xl:grid-cols-4"
        role="status"
      >
        <span className="sr-only">{t('Loading runtime statistics')}</span>
        {SKELETON_TILES.map((tile) => (
          <Skeleton className="h-36 w-full" key={tile} />
        ))}
      </div>
    )
  } else {
    body = (
      <>
        <div className="grid grid-cols-1 gap-4 px-5 pb-5 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            footer={
              <span className="text-xs text-muted">
                {t('{{size}} reserved from the OS', { size: formatBytes(memory.sys) })}
              </span>
            }
            icon={<CpuIcon aria-hidden="true" />}
            label={t('Heap in use')}
            value={formatBytes(memory.alloc)}
          />
          <StatCard
            icon={<ActivityIcon aria-hidden="true" />}
            iconTone="info"
            label={t('Goroutines')}
            value={formatNumber(memory.num_goroutine)}
          />
          <StatCard
            footer={
              <span className="text-xs text-muted">
                {t('{{size}} allocated since start', { size: formatBytes(memory.total_alloc) })}
              </span>
            }
            icon={<RecycleIcon aria-hidden="true" />}
            iconTone="secondary"
            label={t('GC cycles')}
            value={formatNumber(memory.num_gc)}
          />
          <StatCard
            icon={<HardDriveIcon aria-hidden="true" />}
            iconTone={resourceTone(disk.used_percent) === 'muted' ? 'primary' : resourceTone(disk.used_percent)}
            label={t('Disk used')}
            meter={{
              label: t('Disk used on the responding node'),
              tone: resourceTone(disk.used_percent),
              value: Math.min(100, Math.max(0, disk.used_percent)),
              valueText: formatPercent(disk.used_percent),
            }}
            value={formatPercent(disk.used_percent)}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 border-t border-border p-5 xl:grid-cols-3">
          <section aria-labelledby="system-cache-heading">
            <h3 className="eyebrow mb-3" id="system-cache-heading">
              {t('Request body cache')}
            </h3>
            <DescriptionList dense items={cacheItems} layout="stacked" />
          </section>

          <section aria-labelledby="system-storage-heading">
            <h3 className="eyebrow mb-3" id="system-storage-heading">
              {t('Disk space')}
            </h3>
            <DescriptionList dense items={storageItems} />
          </section>

          <section aria-labelledby="system-config-heading">
            <h3 className="eyebrow mb-3" id="system-config-heading">
              {t('Configuration')}
            </h3>
            <DescriptionList dense items={configItems} layout="stacked" />
          </section>
        </div>
      </>
    )
  }

  return (
    <Panel aria-labelledby="system-performance-heading" className="overflow-hidden">
      <Panel.Header
        actions={
          <PollStatus
            dataUpdatedAt={statsQuery.dataUpdatedAt}
            intervalMs={PERFORMANCE_POLL_INTERVAL_MS}
            isFetching={statsQuery.isFetching}
            isVisible={isVisible}
            onRefresh={refresh}
            refreshLabel={t('Refresh runtime statistics now')}
          />
        }
        icon={<ActivityIcon aria-hidden="true" className="size-5 text-primary" />}
        title={t('Runtime')}
        titleId="system-performance-heading"
      />

      <Panel.Body>
        <Alert icon={<InfoIcon aria-hidden="true" />} live="status" tone="info">
          {t('Every figure below comes from the single process that answered this request — Go heap, goroutines and the body cache are per-process. The instances table above is the deployment-wide view.')}
        </Alert>
      </Panel.Body>

      {body}

      <Panel.Footer align="between">
        <p className="text-xs leading-5 text-muted">
          {t('Each control acts on the node that answers the call, and there is no way to pick which one.')}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={statsQuery.isError}
            onClick={() => setPendingAction('gc')}
            size="sm"
            variant="outline"
          >
            <RecycleIcon aria-hidden="true" />
            {t('Force GC')}
          </Button>
          <Button
            disabled={statsQuery.isError}
            onClick={() => setPendingAction('reset-stats')}
            size="sm"
            variant="danger"
          >
            <ActivityIcon aria-hidden="true" />
            {t('Reset counters')}
          </Button>
          <Button
            disabled={statsQuery.isError}
            onClick={() => setPendingAction('clear-disk-cache')}
            size="sm"
            variant="danger"
          >
            <TrashIcon aria-hidden="true" />
            {t('Clear body cache')}
          </Button>
        </div>
      </Panel.Footer>

      <ConfirmDialog
        cancelLabel={t('Cancel')}
        confirmLabel={activeCopy?.confirmLabel ?? t('Confirm')}
        description={activeCopy?.description}
        destructive={activeCopy?.destructive ?? false}
        isLoading={maintenance.isPending}
        onConfirm={() => {
          if (pendingAction !== null) maintenance.mutate(pendingAction)
        }}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null)
        }}
        open={pendingAction !== null}
        title={activeCopy?.title ?? ''}
      >
        {activeCopy?.warning ? (
          <Alert icon={<TriangleAlertIcon aria-hidden="true" />} tone="warning">
            {activeCopy.warning}
          </Alert>
        ) : undefined}
      </ConfirmDialog>
    </Panel>
  )
}
