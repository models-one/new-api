import type { Tone } from '@/components/ui'

import type { SystemInstance } from '@/features/system-info/api'

/**
 * Byte formatting lives here rather than in `lib/format.ts` because the shared
 * formatter set has no byte helper yet. Binary units, matching the Go side:
 * `disk_cache_max_bytes` is 1073741824 for a 1024 MB configured maximum.
 */
const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const

export function formatBytes(bytes: number | undefined): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes)) return '—'
  if (bytes === 0) return '0 B'
  if (bytes < 0) return `-${formatBytes(-bytes)}`

  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), BYTE_UNITS.length - 1)
  const value = bytes / 1024 ** index
  return `${value.toLocaleString('en-US', {
    maximumFractionDigits: index === 0 ? 0 : 1,
  })} ${BYTE_UNITS[index]}`
}

/**
 * Compact duration for uptimes and heartbeat ages: the two largest non-zero units,
 * so "2d 7h" and "45s" both stay short enough for a table cell.
 */
export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds)) return '—'
  const seconds = Math.max(0, Math.floor(totalSeconds))
  if (seconds < 1) return '0s'

  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3_600)
  const minutes = Math.floor((seconds % 3_600) / 60)
  const remainder = seconds % 60

  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`, `${hours}h`)
  else if (hours > 0) parts.push(`${hours}h`, `${minutes}m`)
  else if (minutes > 0) parts.push(`${minutes}m`, `${remainder}s`)
  else parts.push(`${remainder}s`)

  return parts.join(' ')
}

/**
 * Colour thresholds for CPU / memory / storage meters. The instances payload carries
 * only a raw `usage_percent` — the server attaches no severity to it — so these two
 * numbers are a console-side presentation choice and the panel says so on screen.
 *
 * They are deliberately NOT the operator's `monitor_*_threshold` values from
 * `GET /api/performance/stats`: those belong to one process's alerting config and
 * this table describes every node.
 */
export const RESOURCE_WARNING_PERCENT = 70
export const RESOURCE_CRITICAL_PERCENT = 90

export function resourceTone(percent: number | undefined): Tone {
  if (typeof percent !== 'number' || !Number.isFinite(percent)) return 'muted'
  if (percent >= RESOURCE_CRITICAL_PERCENT) return 'destructive'
  if (percent >= RESOURCE_WARNING_PERCENT) return 'warning'
  return 'success'
}

export function instanceNodeName(instance: SystemInstance): string {
  const reported = instance.info?.node?.name
  return reported && reported.trim() !== '' ? reported : instance.node_name
}

export function instanceHostname(instance: SystemInstance): string | undefined {
  const hostname = instance.info?.host?.hostname
  return hostname && hostname.trim() !== '' ? hostname : undefined
}

export function isMasterInstance(instance: SystemInstance): boolean {
  return instance.info?.role?.is_master === true
}

/**
 * True when the node name was derived from the hostname because `NODE_NAME` is unset
 * (`common.GetNodeIdentity`). Worth surfacing: a container whose hostname changes on
 * every restart leaves an orphaned row behind each time.
 */
export function isAutoNamedInstance(instance: SystemInstance): boolean {
  return instance.info?.node?.should_configure_manually === true
}

/** e.g. `darwin/arm64`. Undefined when the heartbeat predates the runtime block. */
export function instancePlatform(instance: SystemInstance): string | undefined {
  const runtime = instance.info?.runtime
  const parts = [runtime?.goos, runtime?.goarch].filter((part): part is string => !!part)
  return parts.length > 0 ? parts.join('/') : undefined
}

export function instanceVersion(instance: SystemInstance): string | undefined {
  const version = instance.info?.runtime?.version
  return version && version.trim() !== '' ? version : undefined
}

/** now − last_seen_at, in seconds. Measured against the BROWSER clock. */
export function heartbeatAgeSeconds(instance: SystemInstance, nowSeconds: number): number {
  return Math.max(0, nowSeconds - instance.last_seen_at)
}

/** now − started_at, in seconds. Measured against the BROWSER clock. */
export function uptimeSeconds(instance: SystemInstance, nowSeconds: number): number {
  return Math.max(0, nowSeconds - instance.started_at)
}

export type InstanceCounts = {
  total: number
  online: number
  stale: number
  master: number
}

/** Counted from the list the server returned; no separate endpoint reports these. */
export function countInstances(instances: readonly SystemInstance[]): InstanceCounts {
  return {
    total: instances.length,
    online: instances.filter((instance) => instance.status === 'online').length,
    stale: instances.filter((instance) => instance.status === 'stale').length,
    master: instances.filter(isMasterInstance).length,
  }
}

/**
 * `GET /api/performance/logs` returns Go `time.Time` values as RFC 3339 strings,
 * unlike every other timestamp in this API. Converted to unix seconds so the shared
 * `formatDateTime` can render them.
 */
export function rfc3339ToUnixSeconds(value: string | undefined): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000)
}

/** Fraction of the configured maximum a disk cache is using, 0..100. */
export function diskCacheUsagePercent(usedBytes: number, maxBytes: number): number | null {
  if (!Number.isFinite(usedBytes) || !Number.isFinite(maxBytes) || maxBytes <= 0) return null
  return Math.min(100, (usedBytes / maxBytes) * 100)
}
