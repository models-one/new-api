import { queryOptions } from '@tanstack/react-query'

import { ApiError, deleteJson, getJson, postJson } from '@/lib/api/client'
import type { ApiEnvelope } from '@/lib/api/types'
import { api } from '@/lib/http-client'

/**
 * Every endpoint in this module sits behind `middleware.RootAuth()`
 * (router/api-router.go, groups `/api/system-info` and `/api/performance`), which is
 * `authHelper(c, common.RoleRootUser)` — role >= 100. An administrator (role 10) is
 * refused with HTTP 403 `AUTH_INSUFFICIENT_PRIVILEGE` exactly like a plain user.
 *
 * NOTE the path: the group is `/api/system-info` with a HYPHEN. There is no
 * `/api/system_info` route on this server.
 */
const queryConfig = { skipBusinessError: true, skipErrorHandler: true } as const

/* ------------------------------------------------------------------ instances */

/** `model.SystemInstanceResponse.status` (model/system_instance.go). */
export type SystemInstanceStatus = 'online' | 'stale'

/**
 * `info` is written by `service.SystemInstanceInfo` and round-trips through a JSON
 * column, so the server hands it back as free-form JSON (`decodeSystemInstanceInfo`
 * returns `any`, and `null` for a row stored before the column was populated).
 * Every branch below is optional for that reason.
 *
 * Verified verbatim against `GET /api/system-info/instances` on the dev server:
 *
 *   { "node_name": "MacBook-Air.local", "status": "online", "stale_after_seconds": 90,
 *     "started_at": 1788048328, "last_seen_at": 1788048779,
 *     "info": { "schema_version": 1,
 *               "node": { "name": "MacBook-Air.local", "source": "hostname",
 *                         "manually_configured": false, "should_configure_manually": true },
 *               "role": { "is_master": true },
 *               "runtime": { "version": "v0.0.0", "goos": "darwin", "goarch": "arm64",
 *                            "started_at": 1788048328 },
 *               "host": { "hostname": "MacBook-Air.local" },
 *               "resources": { "cpu": { "usage_percent": 17.5 },
 *                              "memory": { "usage_percent": 47.4 },
 *                              "storage": { "total_bytes": 494384795648, "used_bytes": 433065873408,
 *                                           "free_bytes": 61318922240, "used_percent": 87.59 } } } }
 */
export type SystemInstanceInfo = {
  schema_version?: number
  node?: {
    name?: string
    /** `manual` when NODE_NAME is set, `hostname` when it was derived. */
    source?: string
    manually_configured?: boolean
    /** Always `!manually_configured` (common/node_identity.go). */
    should_configure_manually?: boolean
  }
  role?: {
    /** `common.IsMasterNode`, i.e. `NODE_TYPE != "slave"`. Not an election. */
    is_master?: boolean
  }
  runtime?: {
    version?: string
    goos?: string
    goarch?: string
    started_at?: number
  }
  host?: {
    hostname?: string
  }
  resources?: {
    cpu?: { usage_percent?: number }
    memory?: { usage_percent?: number }
    storage?: {
      total_bytes?: number
      used_bytes?: number
      free_bytes?: number
      used_percent?: number
    }
  }
}

export type SystemInstance = {
  node_name: string
  /** Computed server-side: `now - last_seen_at > stale_after_seconds` (unix SECONDS). */
  status: SystemInstanceStatus
  /** `model.SystemInstanceStaleAfterSeconds`, currently 90. */
  stale_after_seconds: number
  started_at: number
  last_seen_at: number
  info?: SystemInstanceInfo | null
}

/**
 * `service.systemInstanceReportInterval` — each node upserts its row every 30s, so
 * polling faster than the heartbeat cannot surface anything new.
 */
export const INSTANCE_HEARTBEAT_INTERVAL_MS = 30_000

export function systemInstancesQuery() {
  return queryOptions({
    queryKey: ['system-info', 'instances'] as const,
    queryFn: () => getJson<SystemInstance[]>('/api/system-info/instances', queryConfig),
    staleTime: 5 * 1000,
  })
}

/**
 * `DELETE /api/system-info/stale-instances` → `{ deleted_count }`.
 * `model.DeleteStaleSystemInstances` removes every row with
 * `last_seen_at < now - 90`, deployment-wide. Online rows are untouched.
 */
export function deleteStaleInstances(): Promise<{ deleted_count: number }> {
  return deleteJson<{ deleted_count: number }>('/api/system-info/stale-instances', queryConfig)
}

/**
 * `DELETE /api/system-info/instances/:node_name` → `{ deleted_count: 1 }`.
 * The WHERE clause carries the same staleness predicate, so the server refuses an
 * online node with `success:false, message:"instance is not stale or no longer exists"`.
 */
export function deleteInstance(nodeName: string): Promise<{ deleted_count: number }> {
  return deleteJson<{ deleted_count: number }>(
    `/api/system-info/instances/${encodeURIComponent(nodeName)}`,
    queryConfig,
  )
}

/* ---------------------------------------------------------------- performance */

/** `common.DiskCacheStats`, verified on `GET /api/performance/stats`. */
export type DiskCacheStats = {
  active_disk_files: number
  current_disk_usage_bytes: number
  active_memory_buffers: number
  current_memory_usage_bytes: number
  disk_cache_hits: number
  memory_cache_hits: number
  disk_cache_max_bytes: number
  disk_cache_threshold_bytes: number
}

/** `controller.MemoryStats` — a snapshot of `runtime.MemStats` for THIS process. */
export type ProcessMemoryStats = {
  alloc: number
  total_alloc: number
  sys: number
  num_gc: number
  num_goroutine: number
}

export type DiskCacheDirInfo = {
  path: string
  exists: boolean
  file_count: number
  total_size: number
}

export type DiskSpaceInfo = {
  total: number
  free: number
  used: number
  used_percent: number
}

export type PerformanceConfig = {
  disk_cache_enabled: boolean
  disk_cache_threshold_mb: number
  disk_cache_max_size_mb: number
  /** Empty when the operator never set one; the effective directory is `disk_cache_info.path`. */
  disk_cache_path: string
  is_running_in_container: boolean
  monitor_enabled: boolean
  monitor_cpu_threshold: number
  monitor_memory_threshold: number
  monitor_disk_threshold: number
}

export type PerformanceStats = {
  cache_stats: DiskCacheStats
  memory_stats: ProcessMemoryStats
  disk_cache_info: DiskCacheDirInfo
  disk_space_info: DiskSpaceInfo
  config: PerformanceConfig
}

/**
 * `runtime.ReadMemStats` briefly stops the world, so this is not a metric to hammer.
 * 15s keeps goroutine and heap movement visible without turning the page into load.
 */
export const PERFORMANCE_POLL_INTERVAL_MS = 15_000

export function performanceStatsQuery() {
  return queryOptions({
    queryKey: ['performance', 'stats'] as const,
    queryFn: () => getJson<PerformanceStats>('/api/performance/stats', queryConfig),
    staleTime: 5 * 1000,
  })
}

/**
 * `controller.LogFilesResponse`. `oldest_time` / `newest_time` / `files[].mod_time`
 * are Go `time.Time` values, so they arrive as RFC 3339 STRINGS here — not as the
 * unix seconds every other timestamp in this API uses.
 *
 * When `common.LogDir` is empty the server answers `{ "enabled": false }` and
 * nothing else, so every other field is optional.
 */
export type LogFileInfo = {
  name: string
  size: number
  mod_time: string
}

export type LogFilesInfo = {
  enabled: boolean
  log_dir?: string
  file_count?: number
  total_size?: number
  oldest_time?: string
  newest_time?: string
  files?: LogFileInfo[] | null
}

export function logFilesQuery() {
  return queryOptions({
    queryKey: ['performance', 'logs'] as const,
    queryFn: () => getJson<LogFilesInfo>('/api/performance/logs', queryConfig),
    staleTime: 30 * 1000,
  })
}

/** `POST /api/performance/gc` — `runtime.GC()` on the answering process. No `data`. */
export function forceGarbageCollection(): Promise<unknown> {
  return postJson<unknown>('/api/performance/gc', undefined, queryConfig)
}

/** `POST /api/performance/reset_stats` — `common.ResetDiskCacheStats()`. No `data`. */
export function resetPerformanceStats(): Promise<unknown> {
  return postJson<unknown>('/api/performance/reset_stats', undefined, queryConfig)
}

/**
 * `DELETE /api/performance/disk_cache` — `CleanupOldDiskCacheFiles(10 * time.Minute)`.
 * Only files untouched for 10 minutes are removed, so an in-flight request keeps its
 * buffer. No `data` comes back, and no count of what was freed.
 */
export function clearDiskCache(): Promise<unknown> {
  return deleteJson<unknown>('/api/performance/disk_cache', queryConfig)
}

/** `mode` is required and the server rejects anything else. */
export type LogCleanupMode = 'by_count' | 'by_days'

export type LogCleanupResult = {
  deleted_count: number
  freed_bytes: number
  /** `null` when nothing failed — Go marshals an empty slice as null here. */
  failed_files: string[] | null
  /** Set when the server answered `success:false` but still deleted part of the batch. */
  partialError?: string
}

/**
 * `DELETE /api/performance/logs?mode=…&value=…`.
 *
 * `by_count` keeps the `value` newest files by NAME (the names are timestamped) and
 * deletes the rest; `by_days` deletes every file whose mtime predates `now - value`
 * days. The file logger's current target is skipped in both modes. `value` must be a
 * positive integer or the server refuses the call outright.
 *
 * A partial failure answers `success:false` WITH a populated `data`, so the raw
 * envelope is read here — otherwise the count of files that really were deleted
 * would be thrown away with the error.
 */
export async function cleanupLogFiles(mode: LogCleanupMode, value: number): Promise<LogCleanupResult> {
  const response = await api.delete<ApiEnvelope<LogCleanupResult | null>>('/api/performance/logs', {
    ...queryConfig,
    params: { mode, value },
  })
  const envelope = response.data
  const result = envelope.data

  if (!envelope.success) {
    if (!result) throw new ApiError(envelope.message || 'Request failed')
    return { ...result, partialError: envelope.message ?? '' }
  }

  return result ?? { deleted_count: 0, failed_files: null, freed_bytes: 0 }
}
