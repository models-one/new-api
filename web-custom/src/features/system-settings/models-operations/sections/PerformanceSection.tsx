import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import RefreshCwIcon from 'lucide-react/dist/esm/icons/refresh-cw'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Input, NumberInput, SwitchRow } from '@/components/form'
import { ConfirmDialog, toErrorMessage, toast } from '@/components/overlay'
import { Alert, Button, DescriptionList, Panel, ProgressBar, Separator } from '@/components/ui'
import { SettingsSection } from '@/features/system-settings/components/SettingsSection'
import {
  readOptionBoolean,
  readOptionNumber,
  readOptionString,
  systemOptionsQuery,
  type SystemOptionMap,
} from '@/features/system-settings/options-store'
import { useOptionSectionForm } from '@/features/system-settings/section-form'
import {
  clearDiskCache,
  forceGarbageCollection,
  performanceStatsQuery,
  resetPerformanceStats,
} from '@/features/system-settings/models-operations/api'
import { formatBytes } from '@/features/system-settings/models-operations/format-bytes'
import { formatNumber, formatPercent } from '@/lib/format'

/**
 * `/system-settings/operations/performance`
 *
 * Eight option keys, all present in `GET /api/option/`, plus live telemetry from
 * `GET /api/performance/stats` — whose payload was read off the running server rather than
 * assumed. It returns `cache_stats`, `memory_stats`, `disk_cache_info`, `disk_space_info`
 * and a `config` echo; there is no `/api/performance/cache` or `/api/performance/monitor`
 * endpoint (both answer "Invalid URL").
 *
 * WHAT THE MONITOR ACTUALLY DOES: with `monitor_enabled` on, a new relay request is
 * REJECTED once host CPU, memory or disk is above its threshold. These are not alerting
 * thresholds — they are a load shedder, which is why each one says so.
 *
 * The three maintenance actions all return `{success, message}` with no data:
 *   DELETE /api/performance/disk_cache  drops cache files idle for over ten minutes
 *   POST   /api/performance/reset_stats zeroes the counters only
 *   POST   /api/performance/gc          runs a Go garbage collection
 */

type PerformanceDraft = {
  'performance_setting.disk_cache_enabled': boolean
  'performance_setting.disk_cache_threshold_mb': number
  'performance_setting.disk_cache_max_size_mb': number
  'performance_setting.disk_cache_path': string
  'performance_setting.monitor_enabled': boolean
  'performance_setting.monitor_cpu_threshold': number
  'performance_setting.monitor_memory_threshold': number
  'performance_setting.monitor_disk_threshold': number
}

function toDraft(options: SystemOptionMap | undefined): PerformanceDraft {
  return {
    'performance_setting.disk_cache_enabled': readOptionBoolean(
      options,
      'performance_setting.disk_cache_enabled',
    ),
    'performance_setting.disk_cache_max_size_mb': readOptionNumber(
      options,
      'performance_setting.disk_cache_max_size_mb',
      1024,
    ),
    'performance_setting.disk_cache_path': readOptionString(
      options,
      'performance_setting.disk_cache_path',
    ),
    'performance_setting.disk_cache_threshold_mb': readOptionNumber(
      options,
      'performance_setting.disk_cache_threshold_mb',
      10,
    ),
    'performance_setting.monitor_cpu_threshold': readOptionNumber(
      options,
      'performance_setting.monitor_cpu_threshold',
      90,
    ),
    'performance_setting.monitor_disk_threshold': readOptionNumber(
      options,
      'performance_setting.monitor_disk_threshold',
      95,
    ),
    'performance_setting.monitor_enabled': readOptionBoolean(
      options,
      'performance_setting.monitor_enabled',
      true,
    ),
    'performance_setting.monitor_memory_threshold': readOptionNumber(
      options,
      'performance_setting.monitor_memory_threshold',
      90,
    ),
  }
}

const serializePerformance = {
  'performance_setting.disk_cache_path': (value: string | number | boolean) => String(value).trim(),
}

export function PerformanceSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const optionsQuery = useQuery(systemOptionsQuery())
  const [clearCacheOpen, setClearCacheOpen] = useState(false)

  const form = useOptionSectionForm<PerformanceDraft>({
    saved: toDraft(optionsQuery.data),
    serialize: serializePerformance,
    validate: (values) => {
      const errors: Partial<Record<keyof PerformanceDraft, string>> = {}

      if (values['performance_setting.disk_cache_threshold_mb'] < 1) {
        errors['performance_setting.disk_cache_threshold_mb'] = t('Enter one megabyte or more.')
      }
      if (values['performance_setting.disk_cache_max_size_mb'] < 100) {
        errors['performance_setting.disk_cache_max_size_mb'] = t('Enter 100 megabytes or more.')
      }
      for (const key of [
        'performance_setting.monitor_cpu_threshold',
        'performance_setting.monitor_memory_threshold',
        'performance_setting.monitor_disk_threshold',
      ] as const) {
        const value = values[key]
        if (value < 1 || value > 100) errors[key] = t('Enter a percentage between 1 and 100.')
      }
      return errors
    },
  })

  const statsQuery = useQuery(performanceStatsQuery(!optionsQuery.isPending))
  const stats = statsQuery.data

  const invalidateStats = () =>
    queryClient.invalidateQueries({ queryKey: ['system-settings', 'performance', 'stats'] })

  const clearCacheMutation = useMutation({
    mutationFn: () => clearDiskCache(),
    onError: (error) => toast.error(toErrorMessage(error)),
    onSuccess: async () => {
      toast.success(t('Idle cache files removed.'))
      await invalidateStats()
    },
  })

  const resetStatsMutation = useMutation({
    mutationFn: () => resetPerformanceStats(),
    onError: (error) => toast.error(toErrorMessage(error)),
    onSuccess: async () => {
      toast.success(t('Cache counters reset.'))
      await invalidateStats()
    },
  })

  const gcMutation = useMutation({
    mutationFn: () => forceGarbageCollection(),
    onError: (error) => toast.error(toErrorMessage(error)),
    onSuccess: async () => {
      toast.success(t('Garbage collection ran.'))
      await invalidateStats()
    },
  })

  const disabled = optionsQuery.isPending || form.isSaving
  const diskCacheOn = form.values['performance_setting.disk_cache_enabled']
  const monitorOn = form.values['performance_setting.monitor_enabled']
  const maxCacheMb = form.values['performance_setting.disk_cache_max_size_mb']

  const freeBytes = stats?.disk_space_info?.free ?? 0
  const cacheWontFit =
    diskCacheOn && freeBytes > 0 && Number.isFinite(maxCacheMb) && freeBytes < maxCacheMb * 1024 * 1024

  // The container's cache directory is fixed, so the server tells us not to offer the field.
  const canChooseCachePath = stats?.config?.is_running_in_container !== true

  const diskUsedBytes = stats?.cache_stats?.current_disk_usage_bytes ?? 0
  const diskMaxBytes = stats?.cache_stats?.disk_cache_max_bytes ?? 0

  /**
   * Three states apart: an unreadable telemetry endpoint must not render as a page of
   * zeroes, which would read as a healthy idle process.
   */
  const telemetry = ((): ReactNode => {
    if (statsQuery.isPending) {
      return (
        <p className="text-xs text-muted" role="status">
          {t('Reading the telemetry…')}
        </p>
      )
    }

    if (statsQuery.isError) {
      return (
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
          title={t('The telemetry could not be read')}
          tone="destructive"
        >
          {toErrorMessage(statsQuery.error)}
        </Alert>
      )
    }

    return (
            <>
              <ProgressBar
                label={t('Request body disk cache')}
                showValue
                value={diskMaxBytes > 0 ? (diskUsedBytes / diskMaxBytes) * 100 : 0}
                valueText={t('{{used}} of {{max}}', {
                  max: formatBytes(diskMaxBytes),
                  used: formatBytes(diskUsedBytes),
                })}
              />

              <DescriptionList
                items={[
                  {
                    description: formatNumber(stats?.cache_stats?.active_disk_files ?? 0),
                    term: t('Files on disk right now'),
                  },
                  {
                    description: formatNumber(stats?.cache_stats?.disk_cache_hits ?? 0),
                    term: t('Disk cache hits'),
                  },
                  {
                    description: formatBytes(stats?.cache_stats?.current_memory_usage_bytes ?? 0),
                    term: t('Held in memory'),
                  },
                  {
                    description: formatNumber(stats?.cache_stats?.memory_cache_hits ?? 0),
                    term: t('Memory cache hits'),
                  },
                ]}
                label={t('Request body cache')}
              />

              <DescriptionList
                items={[
                  {
                    description: formatBytes(stats?.memory_stats?.alloc ?? 0),
                    term: t('Memory in use'),
                  },
                  {
                    description: formatBytes(stats?.memory_stats?.sys ?? 0),
                    term: t('Memory reserved from the OS'),
                  },
                  {
                    description: formatNumber(stats?.memory_stats?.num_goroutine ?? 0),
                    term: t('Concurrent tasks'),
                  },
                  {
                    description: formatNumber(stats?.memory_stats?.num_gc ?? 0),
                    term: t('Garbage collections'),
                  },
                ]}
                label={t('Process memory')}
              />

              <DescriptionList
                items={[
                  {
                    description: (
                      <span className="mono text-xs">
                        {stats?.disk_cache_info?.path ?? '—'}
                      </span>
                    ),
                    term: t('Cache directory'),
                  },
                  {
                    description:
                      stats?.disk_cache_info?.exists === false
                        ? t('Not created yet')
                        : t('{{count}} files, {{size}}', {
                            count: stats?.disk_cache_info?.file_count ?? 0,
                            size: formatBytes(stats?.disk_cache_info?.total_size ?? 0),
                          }),
                    term: t('Directory contents'),
                  },
                  {
                    description: t('{{used}} used of {{total}}', {
                      total: formatBytes(stats?.disk_space_info?.total ?? 0),
                      used: formatBytes(stats?.disk_space_info?.used ?? 0),
                    }),
                    term: t('Volume'),
                  },
                ]}
                label={t('Cache directory')}
              />
            </>
    )
  })()

  return (
    <div className="flex flex-col gap-6">
      <SettingsSection
        description={t('Where large request bodies are held, and when the gateway starts refusing work to protect the host.')}
        form={form}
        saveMode="section"
        title={t('Performance')}
      >
        {cacheWontFit ? (
          <Alert
            icon={<TriangleAlertIcon aria-hidden="true" />}
            title={t('The cache limit is larger than the free disk')}
            tone="warning"
          >
            {t('The cache is allowed to grow to {{limit}} but only {{free}} is free on that volume. Caching will start failing before the limit is reached.', {
              free: formatBytes(freeBytes),
              limit: formatBytes(maxCacheMb * 1024 * 1024),
            })}
          </Alert>
        ) : null}

        <SwitchRow
          checked={diskCacheOn}
          description={t('Holds a large request body on disk instead of in memory while it is being relayed. It trades memory for disk I/O, so an SSD is assumed.')}
          disabled={disabled}
          label={t('Buffer large request bodies on disk')}
          onCheckedChange={(checked) =>
            form.setField('performance_setting.disk_cache_enabled', checked)
          }
        />

        <div className="grid gap-5 md:grid-cols-2">
          <NumberInput
            description={t('A body larger than this goes to disk; anything smaller stays in memory.')}
            disabled={disabled || !diskCacheOn}
            error={form.errors['performance_setting.disk_cache_threshold_mb']}
            invalid={form.errors['performance_setting.disk_cache_threshold_mb'] !== undefined}
            label={t('Buffer to disk above (MB)')}
            min={1}
            onValueChange={(value) =>
              form.setField('performance_setting.disk_cache_threshold_mb', value ?? Number.NaN)
            }
            step={1}
            value={form.values['performance_setting.disk_cache_threshold_mb']}
          />
          <NumberInput
            description={
              stats?.disk_space_info?.total === undefined
                ? t('The total the cache directory may occupy.')
                : t('The total the cache directory may occupy. {{free}} free of {{total}} on that volume.', {
                    free: formatBytes(stats.disk_space_info.free ?? 0),
                    total: formatBytes(stats.disk_space_info.total),
                  })
            }
            disabled={disabled || !diskCacheOn}
            error={form.errors['performance_setting.disk_cache_max_size_mb']}
            invalid={form.errors['performance_setting.disk_cache_max_size_mb'] !== undefined}
            label={t('Maximum cache size (MB)')}
            min={100}
            onValueChange={(value) =>
              form.setField('performance_setting.disk_cache_max_size_mb', value ?? Number.NaN)
            }
            step={1}
            value={maxCacheMb}
          />
        </div>

        {canChooseCachePath ? (
          <Input
            description={t('Leave empty to use the system temporary directory. The path must be writable by the process that runs the gateway.')}
            disabled={disabled || !diskCacheOn}
            label={t('Cache directory')}
            onChange={(event) =>
              form.setField('performance_setting.disk_cache_path', event.target.value)
            }
            placeholder={stats?.disk_cache_info?.path ?? '/tmp/new-api-body-cache'}
            value={form.values['performance_setting.disk_cache_path']}
          />
        ) : (
          <Alert title={t('The cache directory is fixed here')} tone="info">
            {t('The server reports it is running in a container, where the cache path is set by the image rather than by this setting.')}
          </Alert>
        )}

        <Separator />

        <SwitchRow
          checked={monitorOn}
          description={t('Watches host CPU, memory and disk. This is a load shedder, not an alert: once a threshold is crossed the gateway REJECTS new relay requests until usage falls back below it.')}
          disabled={disabled}
          label={t('Refuse new requests when the host is overloaded')}
          onCheckedChange={(checked) =>
            form.setField('performance_setting.monitor_enabled', checked)
          }
        />

        <div className="grid gap-5 md:grid-cols-3">
          <NumberInput
            description={t('New requests are refused above this CPU usage.')}
            disabled={disabled || !monitorOn}
            error={form.errors['performance_setting.monitor_cpu_threshold']}
            invalid={form.errors['performance_setting.monitor_cpu_threshold'] !== undefined}
            label={t('CPU limit (%)')}
            max={100}
            min={1}
            onValueChange={(value) =>
              form.setField('performance_setting.monitor_cpu_threshold', value ?? Number.NaN)
            }
            step={1}
            value={form.values['performance_setting.monitor_cpu_threshold']}
          />
          <NumberInput
            description={t('New requests are refused above this memory usage.')}
            disabled={disabled || !monitorOn}
            error={form.errors['performance_setting.monitor_memory_threshold']}
            invalid={form.errors['performance_setting.monitor_memory_threshold'] !== undefined}
            label={t('Memory limit (%)')}
            max={100}
            min={1}
            onValueChange={(value) =>
              form.setField('performance_setting.monitor_memory_threshold', value ?? Number.NaN)
            }
            step={1}
            value={form.values['performance_setting.monitor_memory_threshold']}
          />
          <NumberInput
            description={
              stats?.disk_space_info?.used_percent === undefined
                ? t('New requests are refused above this disk usage.')
                : t('New requests are refused above this disk usage. It is at {{current}} right now.', {
                    current: formatPercent(stats.disk_space_info.used_percent / 100),
                  })
            }
            disabled={disabled || !monitorOn}
            error={form.errors['performance_setting.monitor_disk_threshold']}
            invalid={form.errors['performance_setting.monitor_disk_threshold'] !== undefined}
            label={t('Disk limit (%)')}
            max={100}
            min={1}
            onValueChange={(value) =>
              form.setField('performance_setting.monitor_disk_threshold', value ?? Number.NaN)
            }
            step={1}
            value={form.values['performance_setting.monitor_disk_threshold']}
          />
        </div>
      </SettingsSection>

      <Panel as="section">
        <Panel.Header
          actions={
            <Button
              aria-busy={statsQuery.isFetching}
              aria-label={t('Refresh the telemetry')}
              disabled={statsQuery.isFetching}
              onClick={() => void statsQuery.refetch()}
              size="icon-md"
              title={t('Refresh the telemetry')}
              variant="quiet"
            >
              <RefreshCwIcon aria-hidden="true" />
            </Button>
          }
          description={t('Read from the running process. These figures are not stored anywhere and reset when it restarts.')}
          title={t('Live telemetry')}
        />

        <Panel.Body className="flex flex-col gap-5">
          {telemetry}
        </Panel.Body>

        <Panel.Footer align="end">
          <Button
            aria-busy={resetStatsMutation.isPending}
            disabled={resetStatsMutation.isPending || statsQuery.isPending}
            onClick={() => resetStatsMutation.mutate()}
            size="sm"
            variant="outline"
          >
            {t('Reset the counters')}
          </Button>
          <Button
            aria-busy={gcMutation.isPending}
            disabled={gcMutation.isPending || statsQuery.isPending}
            onClick={() => gcMutation.mutate()}
            size="sm"
            variant="outline"
          >
            {t('Run garbage collection')}
          </Button>
          <Button
            aria-busy={clearCacheMutation.isPending}
            disabled={clearCacheMutation.isPending || statsQuery.isPending}
            onClick={() => setClearCacheOpen(true)}
            size="sm"
            variant="danger"
          >
            {t('Delete idle cache files')}
          </Button>
        </Panel.Footer>
      </Panel>

      <ConfirmDialog
        cancelLabel={t('Cancel')}
        confirmLabel={t('Delete idle cache files')}
        description={t('Deletes buffered request bodies that have not been touched for more than ten minutes. Requests still in flight keep their files, so this is safe to run under load — but a body deleted mid-retry cannot be replayed.')}
        destructive
        isLoading={clearCacheMutation.isPending}
        onConfirm={() => {
          setClearCacheOpen(false)
          clearCacheMutation.mutate()
        }}
        onOpenChange={setClearCacheOpen}
        open={clearCacheOpen}
        title={t('Delete idle cache files?')}
      />
    </div>
  )
}
