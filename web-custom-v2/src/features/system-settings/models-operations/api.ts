import { queryOptions } from '@tanstack/react-query'

import { deleteJson, getJson, postJson } from '@/lib/api/client'

/**
 * The endpoints these two settings groups need beyond the option store, every one of them
 * verified against the running dev server rather than read off the legacy source.
 *
 * ALL OF THEM ARE ROOT-ONLY except the deployment settings probe:
 *   /api/system-task/*   middleware.RootAuth()
 *   /api/performance/*   middleware.RootAuth()
 *   /api/option/*        middleware.RootAuth()
 *   /api/deployments/*   middleware.AdminAuth()   (role >= 10)
 * The settings shell already gates the whole area at role 100, so nothing here is reachable
 * below that.
 */

/* ------------------------------------------------------------------ *
 * System tasks — the log purge and the price sync both run as one.
 * ------------------------------------------------------------------ */

export type SystemTaskStatus = 'pending' | 'running' | 'succeeded' | 'failed'

/**
 * `model.SystemTaskResponse`. `payload`, `state` and `result` are `any` on the wire —
 * their shape depends on the task type — so they arrive as `unknown` and each caller
 * narrows what it actually reads.
 */
export type SystemTask = {
  id: number
  task_id: string
  type: string
  status: SystemTaskStatus
  active_key?: string
  payload: unknown
  state: unknown
  result: unknown
  error: string
  locked_by: string
  created_at: number
  updated_at: number
}

export const SYSTEM_TASK_TYPE_LOG_CLEANUP = 'log_cleanup'
export const SYSTEM_TASK_TYPE_PRICE_SYNC = 'price_sync'

export function isTaskActive(task: SystemTask | null | undefined): boolean {
  return task?.status === 'pending' || task?.status === 'running'
}

/**
 * `GET /api/system-task/current?type=…` answers `data: null` unless a task of that type is
 * PENDING OR RUNNING right now — a finished run is not "current". Verified live: the
 * log-cleanup task created during verification returned `null` here one second after it
 * succeeded.
 */
export function currentSystemTaskQuery(type: string, enabled: boolean) {
  return queryOptions({
    enabled,
    queryKey: ['system-settings', 'system-task', 'current', type] as const,
    queryFn: () =>
      getJson<SystemTask | null>('/api/system-task/current', {
        disableDuplicate: true,
        params: { type },
        skipBusinessError: true,
        skipErrorHandler: true,
      }),
    // The task runs server-side; only a poll shows progress.
    refetchInterval: (query) => (isTaskActive(query.state.data ?? null) ? 1500 : false),
    staleTime: 0,
  })
}

/**
 * `GET /api/system-task/list` takes ONLY `limit`. `controller.ListSystemTasks` reads no
 * other query parameter — a `type` argument is silently ignored (verified: passing
 * `type=price_sync` returned the log-cleanup row first). Filtering is therefore done here.
 */
export function systemTaskListQuery(limit: number, enabled: boolean) {
  return queryOptions({
    enabled,
    queryKey: ['system-settings', 'system-task', 'list', limit] as const,
    queryFn: () =>
      getJson<SystemTask[] | null>('/api/system-task/list', {
        params: { limit },
        skipBusinessError: true,
        skipErrorHandler: true,
      }),
    staleTime: 5 * 1000,
  })
}

export function findLatestTask(
  tasks: readonly SystemTask[] | null | undefined,
  type: string,
): SystemTask | undefined {
  if (!Array.isArray(tasks)) return undefined
  // The list arrives newest first (id 28 before 27 on the dev server), but sorting makes
  // that independent of the server's ordering.
  return [...tasks]
    .filter((task) => task.type === type)
    .sort((left, right) => right.created_at - left.created_at)[0]
}

/**
 * Starts the log purge. `target_timestamp` is UNIX SECONDS and everything strictly older
 * is deleted. `controller.CreateLogCleanupSystemTask` rejects a zero or missing value with
 * `success:false, "target timestamp is required"`.
 */
export function startLogCleanup(targetTimestamp: number): Promise<SystemTask> {
  return postJson<SystemTask>('/api/system-task/log-cleanup', null, {
    params: { target_timestamp: targetTimestamp },
    skipBusinessError: true,
    skipErrorHandler: true,
  })
}

/**
 * Starts one price sync outside the schedule. A run already pending or running answers
 * HTTP **409** (not a 200 envelope), which axios raises — the caller distinguishes it.
 */
export function startPriceSync(dryRun: boolean): Promise<SystemTask> {
  return postJson<SystemTask>('/api/system-task/price-sync', undefined, {
    params: { dry_run: dryRun },
    skipBusinessError: true,
    skipErrorHandler: true,
  })
}

/** `controller.CreateModelPriceSyncSystemTask` returns 409 when a sync is already queued. */
export function isConflictError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const response = (error as { response?: { status?: number } }).response
  return response?.status === 409
}

/**
 * `modelPriceSyncSummary` as `controller/price_sync.go` serialises it. Every field is
 * optional here because the summary is stored as free-form JSON in the task row and an
 * older row may predate a field.
 */
export type PriceSyncSummary = {
  source?: string
  source_models?: number
  apply_mode?: string
  dry_run?: boolean
  applied?: number
  deferred_increases?: number
  skipped?: Record<string, number>
  changes_omitted?: number
  deferred_omitted?: number
}

export function readPriceSyncSummary(result: unknown): PriceSyncSummary | undefined {
  if (typeof result !== 'object' || result === null || Array.isArray(result)) return undefined
  return result as PriceSyncSummary
}

/** `state` of a log-cleanup task: `{processed, progress, remaining, total}`. */
export type LogCleanupState = {
  processed: number
  progress: number
  remaining: number
  total: number
}

export function readLogCleanupState(state: unknown): LogCleanupState {
  const empty: LogCleanupState = { processed: 0, progress: 0, remaining: 0, total: 0 }
  if (typeof state !== 'object' || state === null || Array.isArray(state)) return empty

  const record = state as Record<string, unknown>
  const readNumber = (key: string): number => {
    const value = record[key]
    return typeof value === 'number' && Number.isFinite(value) ? value : 0
  }
  return {
    processed: readNumber('processed'),
    progress: readNumber('progress'),
    remaining: readNumber('remaining'),
    total: readNumber('total'),
  }
}

/** `result` of a finished log-cleanup task: `{deleted_count}`. Verified live. */
export function readDeletedCount(result: unknown): number | undefined {
  if (typeof result !== 'object' || result === null || Array.isArray(result)) return undefined
  const value = (result as Record<string, unknown>).deleted_count
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/* ------------------------------------------------------------------ *
 * Performance telemetry.
 * ------------------------------------------------------------------ */

/** `GET /api/performance/stats`, field for field as the dev server returned it. */
export type PerformanceStats = {
  cache_stats?: {
    active_disk_files?: number
    current_disk_usage_bytes?: number
    active_memory_buffers?: number
    current_memory_usage_bytes?: number
    disk_cache_hits?: number
    memory_cache_hits?: number
    disk_cache_max_bytes?: number
    disk_cache_threshold_bytes?: number
  }
  memory_stats?: {
    alloc?: number
    total_alloc?: number
    sys?: number
    num_gc?: number
    num_goroutine?: number
  }
  disk_cache_info?: {
    path?: string
    exists?: boolean
    file_count?: number
    total_size?: number
  }
  disk_space_info?: {
    total?: number
    free?: number
    used?: number
    used_percent?: number
  }
  config?: {
    disk_cache_enabled?: boolean
    disk_cache_threshold_mb?: number
    disk_cache_max_size_mb?: number
    disk_cache_path?: string
    is_running_in_container?: boolean
    monitor_enabled?: boolean
    monitor_cpu_threshold?: number
    monitor_memory_threshold?: number
    monitor_disk_threshold?: number
  }
}

export function performanceStatsQuery(enabled: boolean) {
  return queryOptions({
    enabled,
    queryKey: ['system-settings', 'performance', 'stats'] as const,
    queryFn: () =>
      getJson<PerformanceStats>('/api/performance/stats', {
        skipBusinessError: true,
        skipErrorHandler: true,
      }),
    staleTime: 5 * 1000,
  })
}

/** Deletes disk-cache files untouched for more than ten minutes. Returns no data field. */
export function clearDiskCache(): Promise<unknown> {
  return deleteJson<unknown>('/api/performance/disk_cache', {
    skipBusinessError: true,
    skipErrorHandler: true,
  })
}

/** Zeroes the hit counters only. No cached body is removed. */
export function resetPerformanceStats(): Promise<unknown> {
  return postJson<unknown>('/api/performance/reset_stats', undefined, {
    skipBusinessError: true,
    skipErrorHandler: true,
  })
}

export function forceGarbageCollection(): Promise<unknown> {
  return postJson<unknown>('/api/performance/gc', undefined, {
    skipBusinessError: true,
    skipErrorHandler: true,
  })
}

/* ------------------------------------------------------------------ *
 * Server log FILES — separate from the database log rows.
 * ------------------------------------------------------------------ */

export type ServerLogFile = {
  name: string
  size: number
  mod_time: string
}

/**
 * `GET /api/performance/logs`. `enabled:false` means the deployment was started without a
 * log directory; the file controls do not exist in that case.
 */
export type ServerLogInfo = {
  enabled: boolean
  log_dir: string
  file_count: number
  total_size: number
  /** RFC 3339 strings, NOT unix seconds — unlike every other timestamp in this API. */
  oldest_time?: string
  newest_time?: string
  files?: ServerLogFile[]
}

export function serverLogInfoQuery(enabled: boolean) {
  return queryOptions({
    enabled,
    queryKey: ['system-settings', 'performance', 'logs'] as const,
    queryFn: () =>
      getJson<ServerLogInfo>('/api/performance/logs', {
        skipBusinessError: true,
        skipErrorHandler: true,
      }),
    staleTime: 5 * 1000,
  })
}

export type ServerLogCleanupMode = 'by_count' | 'by_days'

export type ServerLogCleanupResult = {
  deleted_count: number
  freed_bytes: number
  failed_files?: string[] | null
}

/**
 * Deletes rotated log FILES from disk. The file currently being written is always skipped
 * server-side. A partial failure comes back as `success:false` WITH data, so the envelope
 * check raises and the caller reports the server's sentence.
 */
export function cleanupServerLogFiles(
  mode: ServerLogCleanupMode,
  value: number,
): Promise<ServerLogCleanupResult> {
  return deleteJson<ServerLogCleanupResult>('/api/performance/logs', {
    params: { mode, value },
    skipBusinessError: true,
    skipErrorHandler: true,
  })
}

/* ------------------------------------------------------------------ *
 * Channel affinity cache.
 * ------------------------------------------------------------------ */

/** `GET /api/option/channel_affinity_cache`, verified live on the dev server. */
export type ChannelAffinityCacheStats = {
  enabled: boolean
  total: number
  unknown: number
  /** Only rules with `include_rule_name` appear here; the others are folded into `unknown`. */
  by_rule_name: Record<string, number>
  cache_capacity: number
  cache_algo: string
}

export function channelAffinityCacheQuery(enabled: boolean) {
  return queryOptions({
    enabled,
    queryKey: ['system-settings', 'channel-affinity', 'cache'] as const,
    queryFn: () =>
      getJson<ChannelAffinityCacheStats>('/api/option/channel_affinity_cache', {
        disableDuplicate: true,
        skipBusinessError: true,
        skipErrorHandler: true,
      }),
    staleTime: 5 * 1000,
  })
}

export type ChannelAffinityCacheClearResult = {
  deleted: number
}

/** `all=true` drops every entry; `rule_name=…` drops one rule's. Both report `{deleted}`. */
export function clearChannelAffinityCache(
  target: { all: true } | { ruleName: string },
): Promise<ChannelAffinityCacheClearResult> {
  const params = 'all' in target ? { all: true } : { rule_name: target.ruleName }
  return deleteJson<ChannelAffinityCacheClearResult>('/api/option/channel_affinity_cache', {
    params,
    skipBusinessError: true,
    skipErrorHandler: true,
  })
}

/* ------------------------------------------------------------------ *
 * Model deployment (io.net).
 * ------------------------------------------------------------------ */

/**
 * `GET /api/deployments/settings`. This is the ONLY way to learn whether an io.net API key
 * is stored: `model_deployment.ionet.api_key` ends in `_key`, so `controller.GetOptions`
 * strips it from the option payload entirely — it is absent, not masked.
 */
export type ModelDeploymentSettings = {
  provider: string
  enabled: boolean
  /** True when a non-empty API key is stored. The key itself is never returned. */
  configured: boolean
  can_connect: boolean
}

export function modelDeploymentSettingsQuery(enabled: boolean) {
  return queryOptions({
    enabled,
    queryKey: ['system-settings', 'model-deployment', 'settings'] as const,
    queryFn: () =>
      getJson<ModelDeploymentSettings>('/api/deployments/settings', {
        skipBusinessError: true,
        skipErrorHandler: true,
      }),
    staleTime: 10 * 1000,
  })
}

/**
 * Validates a key against io.net. An empty `api_key` tells the server to use the stored
 * one; with nothing stored it answers `success:false, "api_key is required"` (verified).
 */
export function testModelDeploymentConnection(apiKey: string): Promise<unknown> {
  return postJson<unknown>(
    '/api/deployments/settings/test-connection',
    apiKey === '' ? {} : { api_key: apiKey },
    { skipBusinessError: true, skipErrorHandler: true },
  )
}

/**
 * The four values `model.SystemTaskResponse.status` can hold, as English source strings
 * for `t()`. The raw enum is a server identifier, not UI copy — rendering it directly
 * leaves an untranslated word inside an otherwise localised badge.
 */
export function systemTaskStatusLabel(status: SystemTaskStatus): string {
  switch (status) {
    case 'pending':
      return 'Queued'
    case 'running':
      return 'Running'
    case 'succeeded':
      return 'Succeeded'
    case 'failed':
      return 'Failed'
  }
}
